/**
 * `axon read` — read the full 95-byte config block and emit it.
 *
 * Output modes:
 *   (default)   human-readable summary
 *   --json      full model as JSON
 *   --svo       raw 95 bytes to stdout (vendor-compatible)
 *   --hex       annotated hex dump (debug)
 */

import { findModel, loadCatalog, loadNotYetMapped } from "../catalog.ts";
import type { GlobalFlags } from "../cli.ts";
import { openDongle } from "../driver/hid.ts";
import { identify, modelIdFromConfig, readFullConfig, type ServoMode } from "../driver/protocol.ts";
import { ExitCode } from "../errors.ts";
import { listParameters, type ParameterValue } from "../parameters.ts";
import { toUint8Array } from "../util/bytes.ts";
import { renderParamTable, renderStatusBar } from "../util/tui.ts";

export interface ReadFlags {
  format: "human" | "json" | "svo" | "hex";
  debug: boolean;
}

export async function runRead(global: GlobalFlags, local: ReadFlags): Promise<number> {
  const handle = await openDongle();
  const identifyReply = await identify(handle);
  let config: Buffer;
  try {
    config = await readFullConfig(handle);
  } finally {
    await handle.release();
  }

  if (local.format === "svo") {
    // Raw bytes to stdout — identical to a vendor .svo file
    process.stdout.write(new Uint8Array(config));
    return ExitCode.Ok;
  }
  if (local.format === "hex") {
    process.stdout.write(`${hexDump(config)}\n`);
    return ExitCode.Ok;
  }
  if (local.format === "json" || global.json) {
    emitJson(config, identifyReply.mode, local.debug);
    return ExitCode.Ok;
  }
  emitHuman(config, identifyReply.mode, global, local.debug);
  return ExitCode.Ok;
}

function friendlyModeLabel(mode: ServoMode): string {
  if (mode === "servo_mode") return "Servo Mode";
  if (mode === "cr_mode") return "CR Mode";
  return "Unknown Mode";
}

function formatPhysical(value: ParameterValue): string | number | boolean | undefined {
  return value.physical ?? undefined;
}

function decodedParameters(config: Buffer, modelId: string, mode: ServoMode) {
  const rows = listParameters()
    .filter((spec) => spec.modes.includes(mode))
    .map((spec) => {
      const value = spec.read(config, modelId);
      return {
        name: spec.name,
        vendor_label: spec.vendorLabel,
        unit: value.unit ?? spec.unit,
        value: formatPhysical(value),
        raw: value.raw,
        ...(value.notes ? { notes: value.notes } : {}),
      };
    });

  const mapped: Record<string, unknown> = {};
  for (const row of rows) {
    mapped[row.name] = {
      vendor_label: row.vendor_label,
      unit: row.unit,
      value: row.value,
      raw: row.raw,
      ...(row.notes ? { notes: row.notes } : {}),
    };
  }

  const notYetMapped = Object.values(loadNotYetMapped())
    .filter((entry) => entry.modes.includes(mode))
    .map((entry) => ({
      name: entry.name,
      vendor_label: entry.vendor_label,
      reason_blocked: entry.reason_blocked,
    }));

  return { mapped, notYetMapped, rows };
}

function emitJson(config: Buffer, mode: ServoMode, debug: boolean): void {
  const modelId = modelIdFromConfig(toUint8Array(config));
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);
  const { mapped, notYetMapped } = decodedParameters(config, modelId, mode);
  const result: Record<string, unknown> = {
    model: {
      id: modelId,
      name: model?.name ?? null,
      known: !!model,
      docs_url: model?.docs_url ?? null,
    },
    mode,
    mode_label: friendlyModeLabel(mode),
    parameters: mapped,
    not_yet_mapped: notYetMapped,
  };
  if (debug) {
    result.raw_bytes_hex = config.toString("hex");
    result.byte_count = config.length;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function formatHumanValue(value: ParameterValue): string {
  if (value.physical === undefined || value.physical === null) {
    if (Array.isArray(value.raw)) return `raw ${value.raw.join(" ")}`;
    return `raw ${value.raw}`;
  }
  const unit = value.unit ?? "";
  if (unit === "deg") return `${value.physical}°`;
  if (unit === "us") {
    const n = value.physical as number;
    return `${n > 0 ? "+" : ""}${n} µs`;
  }
  if (unit === "percent") return `${value.physical}%`;
  if (unit === "step") return `step ${value.physical}`;
  return String(value.physical);
}

function emitHuman(config: Buffer, mode: ServoMode, _global: GlobalFlags, debug: boolean): void {
  const modelId = modelIdFromConfig(toUint8Array(config));
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);
  const { rows, notYetMapped } = decodedParameters(config, modelId, mode);
  const humanRows = rows.map((row) => ({
    name: row.name,
    value: formatHumanValue({
      raw: row.raw as number | number[],
      physical: row.value as string | number | boolean | undefined,
      unit: row.unit,
    }),
    unit: row.unit,
  }));

  process.stdout.write(
    `${renderStatusBar({
      adapter: true,
      servoName: model?.name ?? modelId,
      modeName: friendlyModeLabel(mode),
    })}\n`,
  );
  process.stdout.write(`model      ${modelId}`);
  if (model?.name) process.stdout.write(`  (${model.name})`);
  if (!model) process.stdout.write(`  [unknown to catalog]`);
  process.stdout.write("\n");
  if (model?.docs_url) {
    process.stdout.write(`docs       ${model.docs_url}\n`);
  }
  if (debug) {
    process.stdout.write(
      `block      ${config.length} bytes (magic ${config.subarray(0, 4).toString("hex")})\n`,
    );
  }
  process.stdout.write("\n");
  process.stdout.write(`${renderParamTable(humanRows)}\n`);
  if (notYetMapped.length > 0) {
    process.stdout.write("\nNot yet mapped:\n");
    for (const entry of notYetMapped) {
      process.stdout.write(`  ${entry.name}  (${entry.vendor_label})\n`);
    }
  }
}

function hexDump(buf: Buffer): string {
  const lines: string[] = [];
  for (let off = 0; off < buf.length; off += 16) {
    const chunk = buf.subarray(off, off + 16);
    const hex = Array.from(chunk)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(47);
    const ascii = Array.from(chunk)
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`  0x${off.toString(16).padStart(2, "0")}  ${hex}  ${ascii}`);
  }
  return lines.join("\n");
}
