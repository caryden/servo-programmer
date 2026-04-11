/**
 * `axon doctor` — non-destructive environment and hardware diagnostics.
 *
 * Unlike `axon status`, which returns one compact state observation,
 * doctor records each phase as a check so users can see how far the
 * stack got: runtime → catalog → USB/HID visibility → HID open →
 * identify → config read.
 */

import pkg from "../../package.json" with { type: "json" };
import { type BundledFirmware, findModel, loadCatalog, loadParameters } from "../catalog.ts";
import type { GlobalFlags } from "../cli.ts";
import { type DongleDescriptor, listDongles, openDongle, PID, VID } from "../driver/hid.ts";
import {
  type IdentifyReply,
  identify,
  modelIdFromConfig,
  readFullConfig,
} from "../driver/protocol.ts";
import type { DongleHandle } from "../driver/transport.ts";
import { AxonError, ExitCode } from "../errors.ts";

type CheckStatus = "pass" | "warn" | "fail";

type DoctorCategory =
  | "ok"
  | "catalog_error"
  | "no_adapter"
  | "multiple_adapters"
  | "adapter_busy"
  | "adapter_io"
  | "no_servo"
  | "servo_io"
  | "unknown_model"
  | "internal";

interface DoctorFlags {
  debug: boolean;
}

interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  category: DoctorCategory | "runtime" | "catalog";
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
}

interface DeviceSummary {
  vendor_id: string;
  product_id: string;
  path: string | null;
  manufacturer: string | null;
  product: string | null;
  serial_number: string | null;
  release: number | null;
  interface: number | null;
  usage_page: number | null;
  usage: number | null;
}

interface DoctorReport {
  ok: boolean;
  category: DoctorCategory;
  checks: DoctorCheck[];
  environment: {
    cli_version: string;
    bun_version: string;
    platform: NodeJS.Platform;
    arch: string;
    node_version: string;
  };
  catalog?: {
    version: string;
    models: number;
    parameters: number;
    firmware_references: number;
    firmware_missing_sha256: number;
    firmware_files_are_external: true;
  };
  adapter?: {
    expected_vid: string;
    expected_pid: string;
    count: number;
    devices: DeviceSummary[];
    openable?: boolean;
  };
  servo?: {
    present: boolean;
    mode_byte?: string;
    mode_label?: string;
    model?: {
      id: string;
      name: string | null;
      known: boolean;
      docs_url: string | null;
    };
  };
  debug?: {
    identify_rx?: string;
    first_config_rx?: string;
    config_prefix?: string;
  };
}

class TracingDongle implements DongleHandle {
  public readonly reads: Buffer[] = [];

  constructor(private readonly inner: DongleHandle) {}

  async write(data: Buffer, timeoutMs?: number): Promise<void> {
    await this.inner.write(data, timeoutMs);
  }

  async read(timeoutMs?: number): Promise<Buffer> {
    const rx = await this.inner.read(timeoutMs);
    this.reads.push(Buffer.from(rx));
    return rx;
  }

  async release(): Promise<void> {
    await this.inner.release();
  }
}

export async function runDoctor(
  global: GlobalFlags,
  local: DoctorFlags = { debug: false },
): Promise<number> {
  const checks: DoctorCheck[] = [];
  const environment = {
    cli_version: pkg.version,
    bun_version: Bun.version,
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
  };

  addCheck(checks, {
    id: "runtime",
    label: "CLI/runtime",
    status: "pass",
    category: "runtime",
    message: `axon ${environment.cli_version}, bun ${environment.bun_version}, ${environment.platform} ${environment.arch}`,
    details: environment,
  });

  let catalog: ReturnType<typeof loadCatalog>;
  let catalogSummary: DoctorReport["catalog"];
  try {
    catalog = loadCatalog();
    const parameters = loadParameters();
    const firmware = Array.from(catalog.models.values()).flatMap((model) =>
      Object.values(model.bundled_firmware),
    );
    const missingSha = firmware.filter((entry) => !hasFirmwareSha(entry)).length;
    catalogSummary = {
      version: catalog.version,
      models: catalog.models.size,
      parameters: parameters.length,
      firmware_references: firmware.length,
      firmware_missing_sha256: missingSha,
      firmware_files_are_external: true,
    };
    addCheck(checks, {
      id: "catalog",
      label: "Catalog",
      status: missingSha === 0 ? "pass" : "warn",
      category: "catalog",
      message:
        `v${catalog.version}: ${catalog.models.size} models, ` +
        `${parameters.length} parameters, ${firmware.length} firmware references ` +
        "(.sfw files external)",
      hint:
        missingSha === 0
          ? undefined
          : `${missingSha} firmware reference(s) are missing SHA-256 values.`,
      details: catalogSummary,
    });
  } catch (e) {
    addCheck(checks, {
      id: "catalog",
      label: "Catalog",
      status: "fail",
      category: "catalog_error",
      message: `catalog failed to load: ${errorMessage(e)}`,
    });
    return emitDoctor(global, finish("catalog_error", checks, environment));
  }

  let dongles: DongleDescriptor[];
  try {
    dongles = listDongles();
  } catch (e) {
    const err = normalizeError(e, "adapter_io");
    addCheck(checks, {
      id: "usb_hid",
      label: "USB/HID visibility",
      status: "fail",
      category: err.category,
      message: err.message,
      hint: err.hint,
    });
    return emitDoctor(
      global,
      finish(err.category, checks, environment, { catalog: catalogSummary }),
    );
  }

  const devices = dongles.map(summarizeDevice);
  const adapter: NonNullable<DoctorReport["adapter"]> = {
    expected_vid: hexWord(VID),
    expected_pid: hexWord(PID),
    count: dongles.length,
    devices,
  };

  if (dongles.length === 0) {
    addCheck(checks, {
      id: "usb_hid",
      label: "USB/HID visibility",
      status: "fail",
      category: "no_adapter",
      message: `no Axon adapter visible at VID ${hexWord(VID)} PID ${hexWord(PID)}`,
      hint: "Plug in the Axon servo programmer adapter. If it is already plugged in, release it from Parallels/Windows or close any app using it, then retry.",
      details: adapter,
    });
    return emitDoctor(
      global,
      finish("no_adapter", checks, environment, {
        catalog: catalogSummary,
        adapter,
      }),
    );
  }

  if (dongles.length > 1) {
    addCheck(checks, {
      id: "usb_hid",
      label: "USB/HID visibility",
      status: "fail",
      category: "multiple_adapters",
      message: `found ${dongles.length} Axon adapters; expected exactly one`,
      hint: "Unplug extra Axon adapters and retry.",
      details: adapter,
    });
    return emitDoctor(
      global,
      finish("multiple_adapters", checks, environment, {
        catalog: catalogSummary,
        adapter,
      }),
    );
  }

  const selected = dongles[0];
  if (selected === undefined) {
    addCheck(checks, {
      id: "usb_hid",
      label: "USB/HID visibility",
      status: "fail",
      category: "internal",
      message: "internal doctor invariant failed: one dongle expected but none selected",
      details: adapter,
    });
    return emitDoctor(
      global,
      finish("internal", checks, environment, {
        catalog: catalogSummary,
        adapter,
      }),
    );
  }
  addCheck(checks, {
    id: "usb_hid",
    label: "USB/HID visibility",
    status: "pass",
    category: "ok",
    message: `1 adapter visible: ${formatDeviceSummary(devices[0])}`,
    details: adapter,
  });

  let handle: DongleHandle;
  try {
    handle = await openDongle(selected);
    adapter.openable = true;
    addCheck(checks, {
      id: "hid_open",
      label: "HID open",
      status: "pass",
      category: "ok",
      message: "adapter opened successfully",
    });
  } catch (e) {
    adapter.openable = false;
    const err = normalizeError(e, "adapter_busy");
    addCheck(checks, {
      id: "hid_open",
      label: "HID open",
      status: "fail",
      category: err.category,
      message: err.message,
      hint: err.hint,
    });
    return emitDoctor(
      global,
      finish(err.category, checks, environment, {
        catalog: catalogSummary,
        adapter,
      }),
    );
  }

  const traced = new TracingDongle(handle);
  let debug: DoctorReport["debug"] | undefined;
  let identifyReply: IdentifyReply | undefined;
  try {
    try {
      identifyReply = await identify(traced);
    } catch (e) {
      const err = normalizeError(e, "servo_io");
      debug = debugReport(local.debug, traced);
      addCheck(checks, {
        id: "identify",
        label: "Identify",
        status: "fail",
        category: err.category,
        message: err.message,
        hint: err.hint,
      });
      return emitDoctor(
        global,
        finish(err.category, checks, environment, {
          catalog: catalogSummary,
          adapter,
          debug,
        }),
      );
    }

    debug = debugReport(local.debug, traced, identifyReply);
    if (!identifyReply.present) {
      addCheck(checks, {
        id: "identify",
        label: "Identify",
        status: "warn",
        category: "no_servo",
        message: `adapter replied no servo (status byte 0x${identifyReply.statusLo.toString(16).padStart(2, "0")})`,
        hint: "Adapter is connected but no servo is detected. Unplug the servo from the adapter and plug it back in (leave the adapter connected).",
        details: {
          status_hi: hexByte(identifyReply.statusHi),
          status_lo: hexByte(identifyReply.statusLo),
        },
      });
      return emitDoctor(
        global,
        finish("no_servo", checks, environment, {
          catalog: catalogSummary,
          adapter,
          servo: { present: false },
          debug,
        }),
      );
    }

    const modeByte = identifyReply.modeByte === null ? undefined : hexByte(identifyReply.modeByte);
    const modeLabel = friendlyModeName(identifyReply.mode);
    addCheck(checks, {
      id: "identify",
      label: "Identify",
      status: "pass",
      category: "ok",
      message: `servo present${modeLabel ? `, ${modeLabel}` : ""}${modeByte ? ` (${modeByte})` : ""}`,
      details: {
        status_hi: hexByte(identifyReply.statusHi),
        status_lo: hexByte(identifyReply.statusLo),
        mode_byte: modeByte,
        mode_label: modeLabel,
      },
    });

    let config: Buffer;
    try {
      config = await readFullConfig(traced);
    } catch (e) {
      const err = normalizeError(e, "servo_io");
      debug = debugReport(local.debug, traced, identifyReply);
      addCheck(checks, {
        id: "config_read",
        label: "Config read",
        status: "fail",
        category: err.category,
        message: err.message,
        hint: err.hint,
      });
      return emitDoctor(
        global,
        finish(err.category, checks, environment, {
          catalog: catalogSummary,
          adapter,
          servo: { present: true, mode_byte: modeByte, mode_label: modeLabel },
          debug,
        }),
      );
    }

    debug = debugReport(local.debug, traced, identifyReply, config);
    const modelId = modelIdFromConfig(config);
    const model = findModel(catalog, modelId);
    const servo = {
      present: true,
      mode_byte: modeByte,
      mode_label: modeLabel,
      model: {
        id: modelId,
        name: model?.name ?? null,
        known: model !== undefined,
        docs_url: model?.docs_url ?? null,
      },
    };
    if (model === undefined) {
      addCheck(checks, {
        id: "config_read",
        label: "Config read",
        status: "warn",
        category: "unknown_model",
        message: `model ${modelId || "(empty)"} is not in the catalog`,
        hint:
          `Open an issue with the output of ` +
          "`axon read --svo > unknown.svo` so this model can be added.",
        details: { model_id: modelId, known: false },
      });
      return emitDoctor(
        global,
        finish("unknown_model", checks, environment, {
          catalog: catalogSummary,
          adapter,
          servo,
          debug,
        }),
      );
    }

    addCheck(checks, {
      id: "config_read",
      label: "Config read",
      status: "pass",
      category: "ok",
      message: `${model.name} (${modelId})`,
      details: { model_id: modelId, known: true, docs_url: model.docs_url ?? null },
    });

    return emitDoctor(
      global,
      finish("ok", checks, environment, {
        catalog: catalogSummary,
        adapter,
        servo,
        debug,
      }),
    );
  } finally {
    try {
      await traced.release();
    } catch {
      // Best-effort cleanup. Doctor has already produced the actionable
      // report; a close failure should not hide it.
    }
  }
}

function addCheck(checks: DoctorCheck[], check: DoctorCheck): void {
  checks.push(check);
}

function finish(
  category: DoctorCategory,
  checks: DoctorCheck[],
  environment: DoctorReport["environment"],
  extra: {
    catalog?: DoctorReport["catalog"];
    adapter?: DoctorReport["adapter"];
    servo?: DoctorReport["servo"];
    debug?: DoctorReport["debug"];
  } = {},
): DoctorReport {
  const report: DoctorReport = {
    ok: category === "ok",
    category,
    checks,
    environment,
  };
  if (extra.catalog) report.catalog = extra.catalog;
  if (extra.adapter) report.adapter = extra.adapter;
  if (extra.servo) report.servo = extra.servo;
  if (extra.debug) report.debug = extra.debug;
  return report;
}

function emitDoctor(global: GlobalFlags, report: DoctorReport): number {
  if (global.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return ExitCode.Ok;
  }
  if (global.quiet) {
    process.stdout.write(`${report.category}\n`);
    return ExitCode.Ok;
  }

  process.stdout.write("Axon doctor\n");
  for (const check of report.checks) {
    process.stdout.write(`${statusIcon(check.status)} ${check.label}: ${check.message}\n`);
    if (check.hint) {
      process.stdout.write(`  hint: ${check.hint}\n`);
    }
  }
  if (report.debug) {
    process.stdout.write("debug:\n");
    if (report.debug.identify_rx) {
      process.stdout.write(`  identify_rx: ${report.debug.identify_rx}\n`);
    }
    if (report.debug.first_config_rx) {
      process.stdout.write(`  first_config_rx: ${report.debug.first_config_rx}\n`);
    }
    if (report.debug.config_prefix) {
      process.stdout.write(`  config_prefix: ${report.debug.config_prefix}\n`);
    }
  }
  return ExitCode.Ok;
}

function statusIcon(status: CheckStatus): string {
  if (status === "pass") return "✓";
  if (status === "warn") return "!";
  return "✗";
}

function summarizeDevice(device: DongleDescriptor): DeviceSummary {
  return {
    vendor_id: hexWord(device.vendorId ?? VID),
    product_id: hexWord(device.productId ?? PID),
    path: device.path ?? null,
    manufacturer: device.manufacturer ?? null,
    product: device.product ?? null,
    serial_number: device.serialNumber ?? null,
    release: device.release ?? null,
    interface: device.interface ?? null,
    usage_page: device.usagePage ?? null,
    usage: device.usage ?? null,
  };
}

function formatDeviceSummary(device: DeviceSummary | undefined): string {
  if (!device) return "unknown device";
  const name = device.product ?? "Axon adapter";
  const maker = device.manufacturer ? ` (${device.manufacturer})` : "";
  const path = device.path ? ` path=${device.path}` : "";
  return `${name}${maker} VID ${device.vendor_id} PID ${device.product_id}${path}`;
}

function normalizeError(
  error: unknown,
  fallback: DoctorCategory,
): { category: DoctorCategory; message: string; hint?: string } {
  if (error instanceof AxonError) {
    return {
      category: mapAxonCategory(error.category, fallback),
      message: error.message,
      hint: error.hint,
    };
  }
  return { category: fallback, message: errorMessage(error) };
}

function mapAxonCategory(
  category: AxonError["category"],
  fallback: DoctorCategory,
): DoctorCategory {
  switch (category) {
    case "no_adapter":
    case "adapter_busy":
    case "adapter_io":
    case "no_servo":
    case "servo_io":
    case "unknown_model":
      return category;
    case "validation":
    case "usage":
    case "internal":
      return fallback;
  }
}

function debugReport(
  enabled: boolean,
  traced: TracingDongle,
  identifyReply?: IdentifyReply,
  config?: Buffer,
): DoctorReport["debug"] | undefined {
  if (!enabled) return undefined;
  const firstRead = identifyReply?.rawRx ?? traced.reads[0];
  const firstConfigRead = traced.reads[1];
  return {
    identify_rx: firstRead ? hexPrefix(firstRead, 32) : undefined,
    first_config_rx: firstConfigRead ? hexPrefix(firstConfigRead, 32) : undefined,
    config_prefix: config ? hexPrefix(config, 32) : undefined,
  };
}

function friendlyModeName(mode: IdentifyReply["mode"]): string | undefined {
  if (mode === "servo_mode") return "Servo Mode";
  if (mode === "cr_mode") return "CR Mode";
  return undefined;
}

function hasFirmwareSha(entry: BundledFirmware): boolean {
  return /^[a-f0-9]{64}$/i.test(entry.sha256);
}

function hexByte(value: number): string {
  return `0x${value.toString(16).padStart(2, "0")}`;
}

function hexWord(value: number): string {
  return `0x${value.toString(16).padStart(4, "0")}`;
}

function hexPrefix(buf: Buffer, count: number): string {
  return Array.from(buf.subarray(0, count))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
