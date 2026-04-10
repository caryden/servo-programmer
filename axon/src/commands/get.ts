/**
 * `axon get` — read a single named parameter (or list them all).
 *
 * Forms:
 *   axon get                       # list all parameters in the current mode
 *   axon get <param>               # show one value, human-readable
 *   axon get <param> --json        # machine-readable JSON
 *   axon get <param> --raw         # raw byte(s) instead of physical units
 *   axon get <param> --help        # description / unit / docs_url
 *
 * NEVER leaks `implementation.*` fields into user-visible output —
 * help and listings only render the user-facing catalog fields.
 */

import { findModel, findServoMode, loadCatalog, loadNotYetMapped } from "../catalog.ts";
import type { GlobalFlags } from "../cli.ts";
import { openDongle } from "../driver/hid.ts";
import { identify, modelIdFromConfig, readFullConfig, type ServoMode } from "../driver/protocol.ts";
import type { DongleHandle } from "../driver/transport.ts";
import { AxonError, ExitCode } from "../errors.ts";
import {
  findParameter,
  isParameterNotYetMapped,
  listParameters,
  notYetMappedReason,
  type ParameterSpec,
  type ParameterValue,
} from "../parameters.ts";
import { renderStatusBar } from "../util/tui.ts";

export interface GetFlags {
  param?: string;
  raw: boolean;
  help: boolean;
}

/**
 * Thin wrapper that owns dongle lifecycle for the 'get' command. Tests
 * that inject a MockDongle call `runGetWithHandle` directly.
 */
export async function runGet(global: GlobalFlags, local: GetFlags): Promise<number> {
  const handle = await openDongle();
  try {
    return await runGetWithHandle(handle, global, local);
  } finally {
    await handle.release();
  }
}

export async function runGetWithHandle(
  handle: DongleHandle,
  global: GlobalFlags,
  local: GetFlags,
): Promise<number> {
  // Parameter-level --help does NOT talk to the dongle. It's a
  // pure lookup into the catalog, and we want it to succeed even
  // if no hardware is attached. Short-circuit here.
  if (local.help && local.param) {
    return printParameterHelp(local.param, global);
  }

  // 1. identify → get mode
  const id = await identify(handle);
  if (!id.present) {
    throw AxonError.notPrimed();
  }

  // 2. read config → get model id
  const config = await readFullConfig(handle);
  const modelId = modelIdFromConfig(config);
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);
  if (!model) {
    throw AxonError.unknownModel(modelId);
  }

  // If no parameter specified, list.
  if (!local.param) {
    return listAllParamsForMode(config, modelId, model.name, id.mode, global);
  }

  // Not-yet-mapped? Return a clean validation error with the
  // reason string from the catalog.
  if (isParameterNotYetMapped(local.param)) {
    const reason = notYetMappedReason(local.param) ?? "not yet mapped";
    throw AxonError.validation(
      `parameter '${local.param}' is recognized but not yet mapped to specific bytes: ${reason}`,
    );
  }

  const spec = findParameter(local.param);
  if (!spec) {
    throw AxonError.usage(
      `unknown parameter '${local.param}'. Run 'axon get' to see the available parameters.`,
    );
  }

  // Mode gating.
  if (!spec.modes.includes(id.mode)) {
    const modeLabel = friendlyModeLabel(id.mode);
    throw AxonError.validation(`parameter '${local.param}' is not available in ${modeLabel}.`);
  }

  // Read and emit.
  const value = spec.read(config, modelId);
  emitSingle(spec, value, local, global);
  return ExitCode.Ok;
}

// ---------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------

function friendlyModeLabel(mode: ServoMode): string {
  if (mode === "servo_mode") return "Servo Mode";
  if (mode === "cr_mode") return "CR Mode";
  return "unknown mode";
}

function listAllParamsForMode(
  config: Buffer,
  modelId: string,
  modelName: string,
  mode: ServoMode,
  global: GlobalFlags,
): number {
  const all = listParameters();
  const applicable = all.filter((p) => p.modes.includes(mode));

  if (global.json) {
    const rows = applicable.map((spec) => {
      const v = spec.read(config, modelId);
      return {
        name: spec.name,
        vendor_label: spec.vendorLabel,
        unit: v.unit ?? spec.unit,
        value: v.physical,
        raw: v.raw,
      };
    });
    // Also list not-yet-mapped parameters available in this mode, so
    // the user can see the full V1.3 surface.
    const nym = loadNotYetMapped();
    const unmapped = Object.values(nym)
      .filter((e) => e.modes.includes(mode))
      .map((e) => ({
        name: e.name,
        vendor_label: e.vendor_label,
        status: "not_yet_mapped",
        reason: e.reason_blocked,
      }));
    const modeSpec = findServoMode(mode === "servo_mode" ? 3 : 4);
    process.stdout.write(
      JSON.stringify(
        {
          mode,
          mode_label: modeSpec?.name ?? friendlyModeLabel(mode),
          parameters: rows,
          not_yet_mapped: unmapped,
        },
        null,
        2,
      ) + "\n",
    );
    return ExitCode.Ok;
  }

  const modeLabel = friendlyModeLabel(mode);

  // Status bar
  process.stdout.write(
    renderStatusBar({ adapter: true, servoName: modelName, modeName: modeLabel }) + "\n",
  );

  // Parameter table
  const maxName = Math.max(...applicable.map((p) => p.name.length), 20);
  for (const spec of applicable) {
    const v = spec.read(config, modelId);
    const formatted = formatPhysical(v);
    process.stdout.write(`  ${spec.name.padEnd(maxName)}  ${formatted}\n`);
  }

  // Not-yet-mapped params
  const nym = loadNotYetMapped();
  const unmappedInMode = Object.values(nym).filter((e) => e.modes.includes(mode));
  if (unmappedInMode.length > 0 && !global.quiet) {
    process.stdout.write("\nNot yet mapped:\n");
    for (const e of unmappedInMode) {
      process.stdout.write(`  ${e.name.padEnd(maxName)}  (${e.vendor_label})\n`);
    }
  }
  return ExitCode.Ok;
}

function formatPhysical(v: ParameterValue): string {
  if (v.physical === undefined || v.physical === null) {
    if (Array.isArray(v.raw)) return `raw ${v.raw.map((x) => x.toString(16)).join(" ")}`;
    return `raw 0x${v.raw.toString(16).padStart(2, "0")}`;
  }
  const unit = v.unit ?? "";
  if (unit === "deg") return `${v.physical}°`;
  if (unit === "us") {
    const n = v.physical as number;
    return `${n > 0 ? "+" : ""}${n} µs`;
  }
  if (unit === "percent") return `${v.physical}%`;
  if (unit === "step") return `step ${v.physical}`;
  if (unit === "enum") return String(v.physical);
  if (unit === "boolean") return String(v.physical);
  return String(v.physical);
}

function emitSingle(
  spec: ParameterSpec,
  value: ParameterValue,
  local: GetFlags,
  global: GlobalFlags,
): void {
  if (global.json) {
    const obj: Record<string, unknown> = {
      name: spec.name,
      vendor_label: spec.vendorLabel,
      unit: value.unit ?? spec.unit,
      value: local.raw ? value.raw : value.physical,
    };
    if (local.raw) {
      obj.raw = value.raw;
    } else {
      obj.raw = value.raw;
    }
    if (value.notes) obj.notes = value.notes;
    process.stdout.write(JSON.stringify(obj) + "\n");
    return;
  }

  if (local.raw) {
    const raw = value.raw;
    if (Array.isArray(raw)) {
      process.stdout.write(`${raw.map((b) => `0x${b.toString(16).padStart(2, "0")}`).join(" ")}\n`);
    } else {
      process.stdout.write(`0x${raw.toString(16).padStart(2, "0")} (${raw})\n`);
    }
    return;
  }

  process.stdout.write(`${formatPhysical(value)}\n`);
  if (value.notes && !global.quiet) {
    process.stderr.write(`note: ${value.notes}\n`);
  }
}

function printParameterHelp(name: string, global: GlobalFlags): number {
  // Not-yet-mapped params still have user-facing docs — render them
  // the same way, but call out the status.
  if (isParameterNotYetMapped(name)) {
    const entry = loadNotYetMapped()[name];
    if (!entry) {
      process.stderr.write(`unknown parameter '${name}'\n`);
      return ExitCode.UsageError;
    }
    if (global.json) {
      process.stdout.write(
        JSON.stringify(
          {
            name,
            vendor_label: entry.vendor_label,
            description: entry.description,
            modes: entry.modes,
            status: "not_yet_mapped",
            reason_blocked: entry.reason_blocked,
          },
          null,
          2,
        ) + "\n",
      );
      return ExitCode.Ok;
    }
    process.stdout.write(`${name} (${entry.vendor_label})\n\n`);
    process.stdout.write(`${entry.description}\n\n`);
    process.stdout.write(`Status: not yet mapped.\n`);
    process.stdout.write(`Modes:  ${entry.modes.join(", ")}\n`);
    return ExitCode.Ok;
  }

  const spec = findParameter(name);
  if (!spec) {
    process.stderr.write(`unknown parameter '${name}'\n`);
    return ExitCode.UsageError;
  }

  if (global.json) {
    const obj: Record<string, unknown> = {
      name: spec.name,
      vendor_label: spec.vendorLabel,
      description: spec.description,
      unit: spec.unit,
      modes: spec.modes,
    };
    if (spec.min != null) obj.min = spec.min;
    if (spec.max != null) obj.max = spec.max;
    if (spec.values) obj.values = spec.values;
    if (spec.docsUrl) obj.docs_url = spec.docsUrl;
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
    return ExitCode.Ok;
  }

  process.stdout.write(`${spec.name} (${spec.vendorLabel})\n\n`);
  process.stdout.write(`${spec.description}\n\n`);
  process.stdout.write(`Unit:  ${spec.unit}\n`);
  if (spec.values && spec.values.length > 0) {
    process.stdout.write(`Values: ${spec.values.join(", ")}\n`);
  }
  if (spec.min != null || spec.max != null) {
    const lo = spec.min != null ? String(spec.min) : "?";
    const hi = spec.max != null ? String(spec.max) : "?";
    process.stdout.write(`Range: ${lo}..${hi} ${spec.unit}\n`);
  }
  process.stdout.write(`Modes: ${spec.modes.join(", ")}\n`);
  if (spec.docsUrl) {
    process.stdout.write(`Docs:  ${spec.docsUrl}\n`);
  }
  return ExitCode.Ok;
}

/**
 * Help for `axon get` itself (no parameter argument). Lists the
 * command's flags and the available parameters.
 */
export function printGetHelp(global: GlobalFlags): number {
  if (global.json) {
    const obj = {
      command: "get",
      flags: ["--json", "--raw", "--help"],
      parameters: listParameters().map((p) => ({
        name: p.name,
        vendor_label: p.vendorLabel,
        unit: p.unit,
        modes: p.modes,
      })),
      not_yet_mapped: Object.values(loadNotYetMapped()).map((e) => ({
        name: e.name,
        vendor_label: e.vendor_label,
      })),
    };
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
    return ExitCode.Ok;
  }
  process.stdout.write(
    `axon get — read a named parameter from the servo\n\n` +
      `USAGE:\n` +
      `  axon get                   List all parameters in the current mode\n` +
      `  axon get <param>           Show one value in human-readable form\n` +
      `  axon get <param> --json    Machine-readable JSON\n` +
      `  axon get <param> --raw     Raw byte(s) instead of decoded units\n` +
      `  axon get <param> --help    Show description, unit, docs for a parameter\n\n` +
      `PARAMETERS:\n`,
  );
  for (const p of listParameters()) {
    process.stdout.write(`  ${p.name.padEnd(22)} ${p.vendorLabel}\n`);
  }
  const nym = loadNotYetMapped();
  if (Object.keys(nym).length > 0) {
    process.stdout.write(`\nNot yet mapped (recognized, but byte location unknown):\n`);
    for (const e of Object.values(nym)) {
      process.stdout.write(`  ${e.name.padEnd(22)} ${e.vendor_label}\n`);
    }
  }
  return ExitCode.Ok;
}
