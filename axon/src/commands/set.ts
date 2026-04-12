/**
 * `axon set` — write a named parameter (or reset to defaults).
 *
 * Forms:
 *   axon set <param> <value>          # read-modify-write with diff + confirm
 *   axon set <param> default          # reset one param to the model default
 *   axon set default                  # reset ALL params in the current mode
 *   axon set default --backup <path>  # save current config before resetting
 *
 * Every write is followed by a read-back and byte-for-byte verify. In
 * `--json` mode the interactive confirm prompt is skipped.
 */

import { writeFileSync } from "node:fs";
import { findModel, loadCatalog } from "../catalog.ts";
import type { GlobalFlags } from "../cli.ts";
import { openDongle } from "../driver/hid.ts";
import {
  CONFIG_BLOCK_SIZE,
  identify,
  modelIdFromConfig,
  readFullConfig,
  type ServoMode,
  writeFullConfig,
} from "../driver/protocol.ts";
import type { DongleHandle } from "../driver/transport.ts";
import { AxonError, ExitCode } from "../errors.ts";
import {
  findParameter,
  getParameterDefault,
  isParameterNotYetMapped,
  listParameters,
  notYetMappedReason,
  type ParameterSpec,
} from "../parameters.ts";
import { confirm } from "../util/prompt.ts";

export interface SetFlags {
  /**
   * Positional arguments after `set`. Interpretations:
   *   [param, value]          → set one
   *   [param, "default"]      → reset one to model default
   *   ["default"]             → reset all in the current mode
   *   []                      → usage error
   */
  positional: string[];
  backup?: string;
  dryRun: boolean;
}

interface ParamChange {
  name: string;
  vendorLabel: string;
  beforeText: string;
  afterText: string;
}

export async function runSet(global: GlobalFlags, local: SetFlags): Promise<number> {
  const handle = await openDongle();
  try {
    return await runSetWithHandle(handle, global, local);
  } finally {
    await handle.release();
  }
}

export async function runSetWithHandle(
  handle: DongleHandle,
  global: GlobalFlags,
  local: SetFlags,
): Promise<number> {
  if (local.positional.length === 0) {
    throw AxonError.usage(
      "`axon set` requires a parameter. Usage: axon set <param> <value> | axon set <param> default | axon set default",
    );
  }

  // 1. identify → get mode
  const id = await identify(handle);
  if (!id.present) {
    throw AxonError.notPrimed();
  }

  // 2. read current config
  const currentConfig = await readFullConfig(handle);
  const modelId = modelIdFromConfig(currentConfig);
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);
  if (!model) {
    throw AxonError.unknownModel(modelId);
  }
  if (id.mode === "unknown") {
    throw AxonError.validation(
      "servo mode is unknown; cannot set parameters until the mode can be identified.",
    );
  }

  // Dispatch form. `local.positional.length === 0` was rejected above
  // so the first element is guaranteed to exist; cast to string to
  // satisfy biome's noNonNullAssertion lint.
  const head = local.positional[0] as string;
  let newConfig: Buffer;
  let changes: ParamChange[];

  if (head === "default" && local.positional.length === 1) {
    // axon set default [--backup <path>]
    if (local.backup) {
      try {
        writeFileSync(local.backup, currentConfig);
      } catch (e) {
        throw AxonError.validation(
          `failed to write backup file ${local.backup}: ${(e as Error).message}`,
        );
      }
      if (!global.quiet) {
        process.stderr.write(`backup: wrote current config to ${local.backup}\n`);
      }
    }
    const result = applyAllDefaults(currentConfig, modelId, id.mode);
    newConfig = result.config;
    changes = result.changes;
  } else {
    // axon set <param> <value>  OR  axon set <param> default
    const paramName = head;
    if (local.positional.length < 2) {
      throw AxonError.usage(
        `\`axon set ${paramName}\` needs a value. Example: axon set servo_angle 180, axon set ${paramName} default`,
      );
    }
    const rawValue = local.positional.slice(1).join(" ");

    // Not-yet-mapped: bail BEFORE the unknown-parameter branch.
    if (isParameterNotYetMapped(paramName)) {
      const reason = notYetMappedReason(paramName) ?? "not yet mapped";
      throw AxonError.validation(
        `parameter '${paramName}' is recognized but not yet mapped to specific bytes: ${reason}`,
      );
    }

    const spec = findParameter(paramName);
    if (!spec) {
      throw AxonError.usage(
        `unknown parameter '${paramName}'. Run 'axon get' to see the available parameters.`,
      );
    }

    if (!spec.modes.includes(id.mode)) {
      throw AxonError.validation(
        `parameter '${paramName}' is not available in ${friendlyModeLabel(id.mode)}.`,
      );
    }

    let parsed: unknown;
    if (rawValue === "default") {
      const def = getParameterDefault(paramName, modelId);
      if (def === undefined) {
        // No definitive factory default is known for this parameter
        // on this model. The vendor exe's own "Default" button is
        // greyed out in exactly this situation (widget-driven defaults
        // with nothing to fall back to). Rather than inventing one,
        // report the observation and leave the servo untouched.
        const current = spec.read(currentConfig, modelId);
        const currentText = formatForDiff(spec, current.physical);
        if (global.json) {
          process.stdout.write(
            `${JSON.stringify({
              changed: false,
              reason: "no_default",
              param: paramName,
              current: currentText,
            })}\n`,
          );
        } else if (!global.quiet) {
          process.stderr.write(
            `no default value for '${paramName}' on model ${modelId} — leaving value at ${currentText}\n`,
          );
        }
        return ExitCode.Ok;
      }
      parsed = def;
    } else {
      parsed = spec.parseUserInput(rawValue, modelId);
    }

    const vErr = spec.validate(parsed, modelId);
    if (vErr !== null) {
      throw AxonError.validation(vErr);
    }

    const before = spec.read(currentConfig, modelId);
    newConfig = spec.write(currentConfig, parsed, modelId);
    const after = spec.read(newConfig, modelId);
    changes = [
      {
        name: spec.name,
        vendorLabel: spec.vendorLabel,
        beforeText: formatForDiff(spec, before.physical),
        afterText: formatForDiff(spec, after.physical),
      },
    ];
  }

  // 3. diff. If empty, exit cleanly.
  if (bufsEqual(currentConfig, newConfig)) {
    if (global.json) {
      process.stdout.write(`${JSON.stringify({ changed: false })}\n`);
    } else if (!global.quiet) {
      process.stderr.write("No change — value already set.\n");
    }
    return ExitCode.Ok;
  }

  showNamedDiff(changes, global);

  if (local.dryRun) {
    if (!global.quiet) {
      process.stderr.write("(--dry-run, not writing)\n");
    }
    return ExitCode.Ok;
  }

  // 4. confirm (skip in --json or --yes)
  if (!global.yes && !global.json) {
    const ok = await confirm(`Apply ${changes.length} change(s)?`);
    if (!ok) {
      process.stderr.write("Aborted.\n");
      return ExitCode.Ok;
    }
  }

  // 5. write
  await writeFullConfig(handle, newConfig);

  // 6. read back + verify
  const verify = await readFullConfig(handle);
  let mismatches = 0;
  for (let i = 0; i < CONFIG_BLOCK_SIZE; i++) {
    if (verify[i] !== newConfig[i]) mismatches++;
  }
  if (mismatches > 0) {
    throw AxonError.servoIo(
      `write verification failed: ${mismatches} byte(s) read back wrong. ` +
        `Servo may be in an inconsistent state.`,
    );
  }

  if (global.json) {
    process.stdout.write(
      `${JSON.stringify({
        changed: true,
        changes: changes.map((c) => ({
          name: c.name,
          before: c.beforeText,
          after: c.afterText,
        })),
      })}\n`,
    );
  } else if (!global.quiet) {
    process.stderr.write(`Wrote ${changes.length} change(s), verified.\n`);
  }
  return ExitCode.Ok;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function friendlyModeLabel(mode: ServoMode): string {
  if (mode === "servo_mode") return "Servo Mode";
  if (mode === "cr_mode") return "CR Mode";
  return "unknown mode";
}

function bufsEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function formatForDiff(
  spec: ParameterSpec,
  physical: number | string | boolean | undefined,
): string {
  if (physical === undefined || physical === null) return "(unknown)";
  const unit = spec.unit;
  if (unit === "deg") return `${physical}°`;
  if (unit === "us") {
    const n = physical as number;
    return `${n > 0 ? "+" : ""}${n} µs`;
  }
  if (unit === "percent") return `${physical}%`;
  if (unit === "step") return `step ${physical}`;
  if (unit === "enum") return String(physical);
  return String(physical);
}

function showNamedDiff(changes: ParamChange[], global: GlobalFlags): void {
  if (global.json) {
    // In --json mode we print a structured preview to stderr so
    // callers that are piping stdout still see the diff, but machine
    // parsers don't have to deal with it.
    process.stderr.write(
      `${JSON.stringify({
        preview: changes.map((c) => ({
          name: c.name,
          vendor_label: c.vendorLabel,
          before: c.beforeText,
          after: c.afterText,
        })),
      })}\n`,
    );
    return;
  }
  const maxName = Math.max(...changes.map((c) => c.name.length), 8);
  process.stderr.write(`The following parameter(s) will change:\n`);
  for (const c of changes) {
    process.stderr.write(`  ${c.name.padEnd(maxName)}  ${c.beforeText} → ${c.afterText}\n`);
  }
}

/**
 * Apply every available-in-current-mode parameter's default value to
 * a fresh copy of the config buffer. Skips parameters that have no
 * catalog default (read-only or unresolved).
 */
function applyAllDefaults(
  current: Buffer,
  modelId: string,
  mode: ServoMode,
): { config: Buffer; changes: ParamChange[] } {
  let config: Buffer = Buffer.from(current);
  const changes: ParamChange[] = [];
  for (const spec of listParameters()) {
    if (!spec.modes.includes(mode)) continue;
    const def = getParameterDefault(spec.name, modelId);
    if (def === undefined) continue;
    const vErr = spec.validate(def, modelId);
    if (vErr !== null) continue; // defensive — a bad catalog default shouldn't kill the reset
    const before = spec.read(config, modelId);
    let next: Buffer;
    try {
      next = spec.write(config, def, modelId);
    } catch {
      // Parameters like loose_pwm_protection reject 'set'; skip.
      continue;
    }
    if (bufsEqual(config, next)) continue;
    const after = spec.read(next, modelId);
    changes.push({
      name: spec.name,
      vendorLabel: spec.vendorLabel,
      beforeText: formatForDiff(spec, before.physical),
      afterText: formatForDiff(spec, after.physical),
    });
    config = Buffer.from(next);
  }
  return { config, changes };
}
