/**
 * `axon mode` — list / inspect / flash known servo modes.
 *
 * Sub-commands (see docs/CLI_DESIGN.md "Mode switching"):
 *
 *   axon mode list                     show known modes for the current servo
 *   axon mode current                  show the mode the connected servo is in
 *   axon mode set <name> [--yes]       flash a known mode (standard|continuous|...)
 *   axon mode set --file <path>        flash an arbitrary .sfw from disk
 *
 * Flashing is the most destructive operation in the CLI. This module
 * intentionally layers three gates before any write leaves the
 * host:
 *
 *   1. Hash verification for catalog firmware found in the user's
 *      firmware search paths. For --file, print the computed hash in
 *      debug output so the user can cross-check it against docs.
 *   2. Prominent visible warning that flashing the wrong firmware is
 *      unrecoverable, plus an interactive confirmation unless the
 *      caller passes `--yes` / `-y`.
 *   3. A model-id match check against the `@0801<model>` header line
 *      inside the .sfw — if the firmware was built for a different
 *      model we refuse.
 *
 * After the flash completes, we re-identify the servo to confirm the
 * new mode and print the old → new transition so the user sees the
 * effect landed.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  type BundledFirmware,
  findModel,
  findServoMode,
  loadCatalog,
  loadServoModes,
  parseModelId,
  type ServoModel,
  type ServoModeSpec,
} from "../catalog.ts";
import type { GlobalFlags } from "../cli.ts";
import { type FlashProgressEvent, type FlashProgressFn, flashFirmware } from "../driver/flash.ts";
import { openDongle } from "../driver/hid.ts";
import {
  type IdentifyReply,
  identify,
  modelIdFromConfig,
  readFullConfig,
  type ServoMode,
} from "../driver/protocol.ts";
import type { DongleHandle } from "../driver/transport.ts";
import { AxonError, ExitCode } from "../errors.ts";
import {
  type FirmwareResolution,
  firmwareResolutionHint,
  resolveCatalogFirmware,
} from "../firmware-store.ts";
import { type DecryptedSfw, decryptSfw, sfwHashHex } from "../sfw.ts";
import { readLineFromStdin } from "../util/prompt.ts";
import { renderProgressBar } from "../util/tui.ts";

export type ModeSubcommand = "list" | "current" | "set";

export interface ModeFlags {
  subcommand: ModeSubcommand;
  /** For `mode set`: the catalog mode name (if no --file). */
  modeName?: string;
  /** For `mode set --file <path>`: path to an arbitrary .sfw file. */
  filePath?: string;
  /**
   * Recovery flashing path: skip identify/config read and rely on the
   * .sfw header plus bootloader family-byte check.
   */
  recover?: boolean;
  /** For catalog recovery: mini|max|micro, or a catalog model id. */
  recoveryModel?: string;
}

// ---- entry points ----------------------------------------------------------

export async function runMode(global: GlobalFlags, local: ModeFlags): Promise<number> {
  const handle = await openDongle();
  try {
    return await runModeWithHandle(handle, global, local);
  } finally {
    await handle.release();
  }
}

/**
 * Same as `runMode` but uses an externally-provided `DongleHandle`.
 * Exposed so tests can drive a MockDongle without going through the
 * real `openDongle()` path.
 */
export async function runModeWithHandle(
  handle: DongleHandle,
  global: GlobalFlags,
  local: ModeFlags,
): Promise<number> {
  switch (local.subcommand) {
    case "list":
      return runModeList(handle, global);
    case "current":
      return runModeCurrent(handle, global);
    case "set":
      return runModeSet(handle, global, local);
    default:
      throw AxonError.usage(`unknown 'mode' sub-command: ${local.subcommand as string}`);
  }
}

// ---- `mode list` -----------------------------------------------------------

async function runModeList(handle: DongleHandle, global: GlobalFlags): Promise<number> {
  const id = await identify(handle);
  if (!id.present) {
    throw AxonError.notPrimed();
  }
  const config = await readFullConfig(handle);
  const modelId = modelIdFromConfig(config);
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);
  if (model === undefined) {
    throw AxonError.unknownModel(modelId);
  }

  type Row = {
    name: string;
    file: string;
    description: string;
    sha256: string;
    available: boolean;
    source: string | null;
    path: string | null;
    unavailable_reason: string | null;
  };
  const rows: Row[] = [];
  for (const [modeKey, entry] of Object.entries(model.bundled_firmware)) {
    const firmware = resolveCatalogFirmware(entry);
    rows.push({
      name: modeKey,
      file: entry.file,
      description: entry.description,
      sha256: entry.sha256,
      available: firmware.found,
      source: firmware.found ? firmware.source : null,
      path: firmware.found ? firmware.path : null,
      unavailable_reason: firmware.found ? null : firmware.reason,
    });
  }

  if (global.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          model: { id: modelId, name: model.name },
          modes: rows,
        },
        null,
        2,
      )}\n`,
    );
    return ExitCode.Ok;
  }

  process.stdout.write(`model    ${modelId} (${model.name})\n`);
  if (rows.length === 0) {
    process.stdout.write("(no catalog firmware listed for this model)\n");
    return ExitCode.Ok;
  }
  process.stdout.write("modes:\n");
  for (const r of rows) {
    const tag = r.available ? `found:${r.source}` : "(missing)";
    process.stdout.write(`  ${r.name.padEnd(11)}  ${tag.padEnd(16)}  ${r.file}\n`);
    process.stdout.write(`                                  ${r.description}\n`);
    if (r.path !== null) {
      process.stdout.write(`                                  ${r.path}\n`);
    }
    if (!r.available && r.unavailable_reason !== null) {
      process.stderr.write(`    reason: ${r.unavailable_reason}\n`);
    }
  }
  return ExitCode.Ok;
}

// ---- `mode current` --------------------------------------------------------

async function runModeCurrent(handle: DongleHandle, global: GlobalFlags): Promise<number> {
  const id = await identify(handle);
  if (!id.present) {
    throw AxonError.notPrimed();
  }

  const modeSpec = lookupServoMode(id.mode);
  const config = await readFullConfig(handle);
  const modelId = modelIdFromConfig(config);
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);

  // Map identify-byte mode → catalog firmware key heuristically:
  // "servo_mode" → "standard", "cr_mode" → "continuous" are the
  // conventions used by the catalog today.
  const matchingCatalogKey = matchingCatalogModeKey(model, id.mode);

  if (global.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          model: { id: modelId, name: model?.name ?? null },
          mode: {
            id: id.mode,
            name: modeSpec?.name ?? null,
            id_byte: modeSpec?.id_byte ?? null,
            catalog_key: matchingCatalogKey,
          },
        },
        null,
        2,
      )}\n`,
    );
    return ExitCode.Ok;
  }

  process.stdout.write(`model    ${modelId}${model ? ` (${model.name})` : ""}\n`);
  if (modeSpec !== null) {
    process.stdout.write(
      `mode     ${modeSpec.name} (${id.mode}, id_byte 0x${modeSpec.id_byte.toString(16).padStart(2, "0")})\n`,
    );
  } else {
    process.stdout.write(`mode     unknown (identify mode byte = ${id.mode})\n`);
  }
  if (matchingCatalogKey) {
    process.stdout.write(`catalog  ${matchingCatalogKey}\n`);
  }
  return ExitCode.Ok;
}

export function matchingCatalogModeKey(
  model: Pick<ServoModel, "bundled_firmware"> | undefined,
  mode: ServoMode,
): string | null {
  if (!model) return null;
  const modeKeyGuess =
    mode === "servo_mode" ? "standard" : mode === "cr_mode" ? "continuous" : null;
  if (modeKeyGuess && Object.hasOwn(model.bundled_firmware, modeKeyGuess)) {
    return modeKeyGuess;
  }
  return null;
}

function lookupServoMode(mode: ServoMode): ServoModeSpec | null {
  if (mode === "unknown") return null;
  const target = mode === "servo_mode" ? 0x03 : 0x04;
  return findServoMode(target) ?? null;
}

// ---- `mode set` ------------------------------------------------------------

async function runModeSet(
  handle: DongleHandle,
  global: GlobalFlags,
  local: ModeFlags,
): Promise<number> {
  const recover = local.recover === true;
  if (
    recover &&
    local.filePath === undefined &&
    (local.modeName === undefined || local.recoveryModel === undefined)
  ) {
    throw AxonError.usage(
      "`axon mode set --recover` requires either --file <path> or " +
        "`axon mode set <servo|cr> --recover <mini|max|micro>` with the firmware in a search path.",
    );
  }
  if (local.filePath === undefined && local.modeName === undefined) {
    throw AxonError.usage(
      "`axon mode set` requires either a mode name or --file <path>. " +
        "Run `axon mode list` to see the known modes for the connected servo.",
    );
  }
  if (local.filePath !== undefined && local.modeName !== undefined) {
    throw AxonError.usage(
      "`axon mode set`: specify either a mode name OR --file <path>, not both.",
    );
  }
  if (local.filePath !== undefined && local.recoveryModel !== undefined) {
    throw AxonError.usage(
      "`axon mode set --file <path>` does not take a recovery model. " +
        "The model comes from the .sfw header.",
    );
  }

  const catalog = loadCatalog();
  let id: IdentifyReply | null = null;
  let modelId: string | null = null;
  let model: ServoModel | undefined;

  if (!recover) {
    id = await identify(handle);
    if (!id.present) {
      throw new AxonError(
        ExitCode.NotPrimed,
        "Adapter connected, but no servo detected before mode flashing.",
        "Replug the servo and retry. For firmware recovery, use `axon mode set --file <path.sfw> --recover` with a known-good firmware file, or put the vendor .sfw in a firmware search path and run `axon mode set servo --recover mini` (or max/micro).",
        "no_servo",
      );
    }
    const config = await readFullConfig(handle);
    modelId = modelIdFromConfig(config);
    model = findModel(catalog, modelId);
    if (model === undefined) {
      throw AxonError.unknownModel(modelId);
    }
  } else if (local.filePath === undefined) {
    if (local.recoveryModel === undefined) {
      throw AxonError.usage(
        "`axon mode set <mode> --recover` requires a model: mini, max, or micro.",
      );
    }
    model = findModelForRecoveryTarget(catalog, local.recoveryModel);
    if (model === undefined) {
      throw AxonError.validation(
        `unknown recovery model "${local.recoveryModel}". Expected mini, max, micro, or a catalog model id.`,
      );
    }
    modelId = model.id;
  }

  // Resolve the user's mode name to a catalog key. Accept
  // human-friendly aliases: "servo" / "servo mode" → "standard",
  // "cr" / "cr mode" / "continuous rotation" → "continuous".
  let sfwCiphertext: Buffer;
  let sourceDescription: string;
  let catalogModeKey: string | null = null;
  if (local.filePath !== undefined) {
    try {
      sfwCiphertext = readFileSync(local.filePath);
    } catch (e) {
      throw AxonError.validation(
        `could not read --file ${local.filePath}: ${(e as Error).message}`,
      );
    }
    sourceDescription = `file:${local.filePath}`;
  } else {
    if (model === undefined) {
      throw AxonError.validation("cannot resolve catalog firmware without a known servo model.");
    }
    if (modelId === null || local.modeName === undefined) {
      throw AxonError.validation("cannot resolve catalog firmware without a mode name.");
    }
    const resolvedKey = resolveModeName(local.modeName, model.bundled_firmware);
    if (resolvedKey === null) {
      const humanNames = Object.keys(model.bundled_firmware)
        .map((k) => friendlyModeKey(k))
        .join(", ");
      throw AxonError.validation(
        `"${local.modeName}" is not a recognized mode. Available: ${humanNames}`,
      );
    }
    catalogModeKey = resolvedKey;
    const entry = model.bundled_firmware[resolvedKey];
    if (!entry) {
      throw AxonError.validation(`mode "${resolvedKey}" not found in catalog.`);
    }
    const firmware = resolveCatalogFirmware(entry);
    if (!firmware.found) {
      throw firmwareResolutionError(model, resolvedKey, entry, firmware);
    }
    sfwCiphertext = firmware.bytes;
    sourceDescription = `${firmware.source}:${firmware.path}`;
  }

  let decrypted: DecryptedSfw;
  try {
    decrypted = decryptSfw(sfwCiphertext);
  } catch (e) {
    throw AxonError.validation(`failed to decrypt firmware: ${(e as Error).message}`);
  }
  if (recover && local.filePath !== undefined) {
    modelId = decrypted.header.modelId;
    model = findModelForFirmwareId(catalog, decrypted.header.modelId);
  }

  const fileHashHex = sfwHashHex(sfwCiphertext);
  const targetModeName = catalogModeKey
    ? friendlyModeKey(catalogModeKey)
    : basename(local.filePath ?? sourceDescription);
  const currentModeName = id ? friendlyModeName(id.mode) : "unknown mode";
  const modelLabel = model ? `${model.name} (${modelId})` : `firmware model ${modelId}`;

  // Simple confirmation — no SHA dumps, no hex record counts,
  // no type-the-word echo. Just tell the user what will happen
  // and let --yes skip it.
  if (!global.json && !global.quiet) {
    if (recover) {
      process.stderr.write(`\nRecovery flashing ${modelLabel} to ${targetModeName}.\n`);
      process.stderr.write(
        "  Cannot identify or read the servo first; using the firmware file header only.\n",
      );
      process.stderr.write(
        "  The bootloader family bytes will still be checked before any erase/write.\n",
      );
    } else {
      process.stderr.write(
        `\nSwitching ${modelLabel} from ${currentModeName} to ${targetModeName}.\n`,
      );
    }
    if (local.filePath !== undefined) {
      process.stderr.write(`  file: ${local.filePath}\n`);
    }
    if (isDebug()) {
      process.stderr.write(`  sha256: ${fileHashHex}\n`);
      process.stderr.write(
        `  firmware: model=${decrypted.header.modelId}, ${decrypted.hexRecords.length} records, ${decrypted.sectorErases.length} sectors\n`,
      );
    }
  }

  if (!global.yes && !global.json) {
    if (!process.stdin.isTTY) {
      // Non-interactive: require AXON_FLASH_CONFIRM=<key> or --yes.
      const envEcho = process.env.AXON_FLASH_CONFIRM ?? "";
      const echoTarget = catalogModeKey ?? (local.filePath ? basename(local.filePath) : "");
      if (envEcho !== echoTarget) {
        process.stderr.write("(non-interactive — pass --yes or set AXON_FLASH_CONFIRM)\n");
        return ExitCode.Ok;
      }
    } else {
      process.stderr.write("Continue? [y/N] ");
      const answer = await readLineFromStdin();
      if (answer.trim().toLowerCase() !== "y") {
        process.stderr.write("Aborted.\n");
        return ExitCode.Ok;
      }
    }
  }

  // Flash.
  const cmdSleepOverride = Number.parseInt(process.env.AXON_FLASH_CMD_SLEEP_MS ?? "", 10);
  await flashFirmware(handle, decrypted, {
    expectedModelId: modelId ?? undefined,
    onProgress: makeProgressSink(global),
    onWireDebug: makeWireDebugSink(global),
    cmdSleepMs: Number.isFinite(cmdSleepOverride) ? cmdSleepOverride : undefined,
  });

  // Re-identify to confirm the mode transition. The servo reboots
  // after the flash, so we retry a few times with a delay to let
  // the new firmware come up.
  let afterId: IdentifyReply | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const id2 = await identify(handle);
      if (id2.present) {
        afterId = id2;
        break;
      }
    } catch {
      // servo still rebooting — try again
    }
  }
  if (afterId === null) {
    process.stderr.write(
      "\nFlash completed but the servo did not respond after 6 seconds. " +
        "Replug the servo and check with `axon status`.\n",
    );
    return ExitCode.ServoIoError;
  }

  if (global.json) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        recovery: recover,
        model: { id: modelId, name: model?.name ?? null },
        old_mode: id?.mode ?? null,
        new_mode: afterId.mode,
        catalog_mode_key: catalogModeKey,
        source: sourceDescription,
        file_sha256: fileHashHex,
      })}\n`,
    );
  } else {
    const newModeName = friendlyModeName(afterId.mode);
    process.stderr.write(`\nDone. ${modelLabel} is now in ${newModeName}.\n`);
  }
  return ExitCode.Ok;
}

// ---- mode name helpers ------------------------------------------------------

/** Map user-friendly names to catalog bundled_firmware keys. */
function resolveModeName(input: string, bundledFirmware: Record<string, unknown>): string | null {
  const normalized = input.toLowerCase().trim();

  // Direct key match (e.g. "standard", "continuous").
  if (Object.hasOwn(bundledFirmware, input)) return input;

  // Human-friendly aliases.
  const aliases: Record<string, string> = {
    servo: "standard",
    "servo mode": "standard",
    servo_mode: "standard",
    cr: "continuous",
    "cr mode": "continuous",
    cr_mode: "continuous",
    "continuous rotation": "continuous",
  };
  const mapped = aliases[normalized];
  if (mapped && Object.hasOwn(bundledFirmware, mapped)) return mapped;

  return null;
}

function normalizeModelId(modelId: string): string {
  return modelId.replace(/[*\0\s]+$/, "");
}

function normalizeModelAlias(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findModelForRecoveryTarget(
  catalog: ReturnType<typeof loadCatalog>,
  target: string,
): ServoModel | undefined {
  const aliases: Record<string, string> = {
    mini: "SA33****",
    axonmini: "SA33****",
    max: "SA81BHMW",
    axonmax: "SA81BHMW",
    micro: "SA20BHS*",
    axonmicro: "SA20BHS*",
  };
  const normalized = normalizeModelAlias(target);
  const aliasModelId = aliases[normalized];
  if (aliasModelId !== undefined) return findModel(catalog, aliasModelId);

  const cleanTarget = normalizeModelId(target);
  for (const candidate of catalog.models.values()) {
    if (candidate.id === target || normalizeModelId(candidate.id) === cleanTarget) {
      return candidate;
    }
  }
  return undefined;
}

function findModelForFirmwareId(
  catalog: ReturnType<typeof loadCatalog>,
  firmwareModelId: string,
): ServoModel | undefined {
  const cleanFirmware = normalizeModelId(firmwareModelId);
  for (const candidate of catalog.models.values()) {
    if (normalizeModelId(candidate.id) === cleanFirmware) return candidate;
  }
  return undefined;
}

function firmwareResolutionError(
  model: ServoModel,
  modeKey: string,
  entry: BundledFirmware,
  resolution: Extract<FirmwareResolution, { found: false }>,
): AxonError {
  const modeLabel = friendlyModeKey(modeKey);
  const reason =
    resolution.reason === "hash_mismatch" ? "found file with wrong SHA-256" : "file not found";
  return new AxonError(
    ExitCode.ValidationError,
    `firmware for ${model.name} ${modeLabel} is not available (${reason}): ${entry.file}`,
    firmwareResolutionHint(entry, resolution),
    "validation",
  );
}

/** User-friendly label for a catalog bundled_firmware key. */
function friendlyModeKey(key: string): string {
  if (key === "standard") return "Servo Mode";
  if (key === "continuous") return "CR Mode";
  return key;
}

/** User-friendly label for the identify-reply mode. */
function friendlyModeName(mode: ServoMode): string {
  if (mode === "servo_mode") return "Servo Mode";
  if (mode === "cr_mode") return "CR Mode";
  return "unknown mode";
}

/** Returns true when AXON_DEBUG=1 is set. */
function isDebug(global?: GlobalFlags): boolean {
  return global?.debug === true || process.env.AXON_DEBUG === "1";
}

function timestampLabel(date: Date): string {
  const core = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${core}.${date.getMilliseconds().toString().padStart(3, "0")}`;
}

function elapsedLabel(ms: number): string {
  const seconds = (ms / 1000).toFixed(3);
  return `+${seconds}s`;
}

function formatProgressDebugLine(event: FlashProgressEvent): string {
  const parts = [`Flash ${event.phase}`];
  if (typeof event.recordsSent === "number" && typeof event.recordsTotal === "number") {
    parts.push(`${event.recordsSent}/${event.recordsTotal} records`);
  }
  if (typeof event.bytesSent === "number" && typeof event.bytesTotal === "number") {
    parts.push(`${event.bytesSent}/${event.bytesTotal} bytes`);
  }
  if (event.message) {
    parts.push(event.message);
  }
  return parts.join(" - ");
}

function makeProgressSink(global: GlobalFlags): FlashProgressFn {
  if (global.json || global.quiet) return () => {};

  const isTTY = process.stderr.isTTY === true;
  const debug = isDebug(global);
  let firstEventAt: number | null = null;
  let started = false;
  return (e: FlashProgressEvent) => {
    if (debug) {
      const now = new Date();
      const nowMs = now.getTime();
      if (firstEventAt === null) {
        firstEventAt = nowMs;
      }
      process.stderr.write(
        `[${timestampLabel(now)} ${elapsedLabel(nowMs - firstEventAt)}] ${formatProgressDebugLine(e)}\n`,
      );
      return;
    }
    if (e.bytesSent !== undefined && e.bytesTotal !== undefined && e.bytesTotal > 0) {
      const bar = renderProgressBar("Flashing", e.bytesSent / e.bytesTotal);
      if (isTTY) {
        process.stderr.write(`\r${bar}`);
      } else if (!started) {
        process.stderr.write("Flashing...");
        started = true;
      }
    }
  };
}

function makeWireDebugSink(global: GlobalFlags): ((message: string) => void) | undefined {
  if (!isDebug(global)) return undefined;

  let firstEventAt: number | null = null;
  return (message: string) => {
    const now = new Date();
    const nowMs = now.getTime();
    if (firstEventAt === null) {
      firstEventAt = nowMs;
    }
    process.stderr.write(
      `[${timestampLabel(now)} ${elapsedLabel(nowMs - firstEventAt)}] [wire] ${message}\n`,
    );
  };
}

export type { IdentifyReply, ServoModel };
export { loadCatalog, loadServoModes, parseModelId };
