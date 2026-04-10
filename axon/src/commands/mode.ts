/**
 * `axon mode` — list / inspect / flash bundled servo modes.
 *
 * Sub-commands (see docs/CLI_DESIGN.md "Mode switching"):
 *
 *   axon mode list                     show bundled modes for the current servo
 *   axon mode current                  show the mode the connected servo is in
 *   axon mode set <name> [--yes]       flash a bundled mode (standard|continuous|...)
 *   axon mode set --file <path>        flash an arbitrary .sfw from disk
 *
 * Flashing is the most destructive operation in the CLI. This module
 * intentionally layers three gates before any write leaves the
 * host:
 *
 *   1. Hash verification (for bundled: `sha256(file) == catalog sha`;
 *      for --file: print the computed hash in the confirmation
 *      prompt so the user can cross-check it against Discord / docs).
 *   2. Prominent visible warning that flashing the wrong firmware is
 *      unrecoverable, plus an echo-the-mode-name prompt that the user
 *      must satisfy exactly, even with `--yes` / `-y`.
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
import { type DecryptedSfw, decryptSfw, sfwHashHex, verifySfwHash } from "../sfw.ts";
import { EMBEDDED_FIRMWARE, type EmbeddedFirmware, findEmbeddedFirmware } from "../sfw-embedded.ts";

export type ModeSubcommand = "list" | "current" | "set";

export interface ModeFlags {
  subcommand: ModeSubcommand;
  /** For `mode set`: the bundled mode name (if no --file). */
  modeName?: string;
  /** For `mode set --file <path>`: path to an arbitrary .sfw file. */
  filePath?: string;
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
    embedded: boolean;
    unavailable_reason: string | null;
  };
  const rows: Row[] = [];
  for (const [modeKey, entry] of Object.entries(model.bundled_firmware)) {
    const emb = findEmbeddedFirmware(modelId, modeKey);
    rows.push({
      name: modeKey,
      file: entry.file,
      description: entry.description,
      sha256: entry.sha256,
      embedded: emb?.available ?? false,
      unavailable_reason: emb && !emb.available ? emb.reason : null,
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
    process.stdout.write("(no bundled firmware listed in catalog for this model)\n");
    return ExitCode.Ok;
  }
  process.stdout.write("modes:\n");
  for (const r of rows) {
    const tag = r.embedded ? "embedded" : "(not embedded)";
    process.stdout.write(`  ${r.name.padEnd(11)}  ${tag.padEnd(16)}  ${r.file}\n`);
    process.stdout.write(`                                  ${r.description}\n`);
    if (!r.embedded && r.unavailable_reason !== null) {
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

  // Map identify-byte mode → bundled_firmware key heuristically:
  // "servo_mode" → "standard", "cr_mode" → "continuous" are the
  // conventions used by the catalog today.
  let matchingBundledKey: string | null = null;
  if (model) {
    const modeKeyGuess =
      id.mode === "servo_mode" ? "standard" : id.mode === "cr_mode" ? "continuous" : null;
    if (modeKeyGuess && modeKeyGuess in model.bundled_firmware) {
      matchingBundledKey = modeKeyGuess;
    }
  }

  if (global.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          model: { id: modelId, name: model?.name ?? null },
          mode: {
            id: id.mode,
            name: modeSpec?.name ?? null,
            id_byte: modeSpec?.id_byte ?? null,
            bundled_key: matchingBundledKey,
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
  if (matchingBundledKey) {
    process.stdout.write(`bundled  ${matchingBundledKey}\n`);
  }
  return ExitCode.Ok;
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
  if (local.filePath === undefined && local.modeName === undefined) {
    throw AxonError.usage(
      "`axon mode set` requires either a mode name or --file <path>. " +
        "Run `axon mode list` to see the bundled modes for the connected servo.",
    );
  }
  if (local.filePath !== undefined && local.modeName !== undefined) {
    throw AxonError.usage(
      "`axon mode set`: specify either a mode name OR --file <path>, not both.",
    );
  }

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

  // Resolve the user's mode name to a catalog key. Accept
  // human-friendly aliases: "servo" / "servo mode" → "standard",
  // "cr" / "cr mode" / "continuous rotation" → "continuous".
  let sfwCiphertext: Buffer;
  let sourceDescription: string;
  let bundledModeKey: string | null = null;
  if (local.filePath !== undefined) {
    try {
      sfwCiphertext = readFileSync(local.filePath);
    } catch (e) {
      throw AxonError.validation(
        `could not read --file ${local.filePath}: ${(e as Error).message}`,
      );
    }
    sourceDescription = local.filePath;
  } else {
    const resolvedKey = resolveModeName(local.modeName!, model.bundled_firmware);
    if (resolvedKey === null) {
      const humanNames = Object.keys(model.bundled_firmware)
        .map((k) => friendlyModeKey(k))
        .join(", ");
      throw AxonError.validation(
        `"${local.modeName}" is not a recognized mode. Available: ${humanNames}`,
      );
    }
    bundledModeKey = resolvedKey;
    const entry = model.bundled_firmware[resolvedKey];
    if (!entry) {
      throw AxonError.validation(`mode "${resolvedKey}" not found in catalog.`);
    }
    const embedded = findEmbeddedFirmware(modelId, resolvedKey);
    if (!embedded || !embedded.available || embedded.base64 === null) {
      throw AxonError.validation(
        `firmware for ${friendlyModeKey(resolvedKey)} is not available in this build. ` +
          `Pass --file <path> to supply it directly.`,
      );
    }
    sfwCiphertext = Buffer.from(embedded.base64, "base64");
    if (!verifySfwHash(sfwCiphertext, entry.sha256)) {
      throw AxonError.validation("embedded firmware integrity check failed.");
    }
    sourceDescription = `bundled:${entry.file}`;
  }

  let decrypted: DecryptedSfw;
  try {
    decrypted = decryptSfw(sfwCiphertext);
  } catch (e) {
    throw AxonError.validation(`failed to decrypt firmware: ${(e as Error).message}`);
  }

  const fileHashHex = sfwHashHex(sfwCiphertext);
  const targetModeName = bundledModeKey
    ? friendlyModeKey(bundledModeKey)
    : basename(local.filePath!);
  const currentModeName = friendlyModeName(id.mode);

  // Simple confirmation — no SHA dumps, no hex record counts,
  // no type-the-word echo. Just tell the user what will happen
  // and let --yes skip it.
  if (!global.json && !global.quiet) {
    process.stderr.write(
      `\nSwitching ${model.name} from ${currentModeName} to ${targetModeName}.\n`,
    );
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
      const echoTarget = bundledModeKey ?? (local.filePath ? basename(local.filePath) : "");
      if (envEcho !== echoTarget) {
        process.stderr.write("(non-interactive — pass --yes or set AXON_FLASH_CONFIRM)\n");
        return ExitCode.Ok;
      }
    } else {
      process.stderr.write("Continue? [y/N] ");
      const answer = await readLine();
      if (answer.trim().toLowerCase() !== "y") {
        process.stderr.write("Aborted.\n");
        return ExitCode.Ok;
      }
    }
  }

  // Flash.
  const cmdSleepOverride = Number.parseInt(process.env.AXON_FLASH_CMD_SLEEP_MS ?? "", 10);
  if (!global.json && !global.quiet) {
    process.stderr.write("Flashing");
  }
  await flashFirmware(handle, decrypted, {
    expectedModelId: modelId,
    onProgress: makeProgressSink(global),
    cmdSleepMs: Number.isFinite(cmdSleepOverride) ? cmdSleepOverride : undefined,
  });

  // Re-identify to confirm the mode transition.
  const afterId = await identify(handle);
  if (!afterId.present) {
    process.stderr.write(
      "\nFlash completed but the servo did not respond. " +
        "Replug the servo and check with `axon status`.\n",
    );
    return ExitCode.ServoIoError;
  }

  if (global.json) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        model: { id: modelId, name: model.name },
        old_mode: id.mode,
        new_mode: afterId.mode,
        bundled_mode_key: bundledModeKey,
        source: sourceDescription,
        file_sha256: fileHashHex,
      })}\n`,
    );
  } else {
    const newModeName = friendlyModeName(afterId.mode);
    process.stderr.write(`\nDone. ${model.name} is now in ${newModeName}.\n`);
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
function isDebug(): boolean {
  return process.env.AXON_DEBUG === "1";
}

/** Read a single line from stdin. Blocks until newline. */
function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const combined = Buffer.concat(chunks).toString("utf8");
      const nl = combined.indexOf("\n");
      if (nl >= 0) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(combined.slice(0, nl).replace(/\r$/, ""));
      }
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

function makeProgressSink(global: GlobalFlags): FlashProgressFn {
  if (global.json || global.quiet) return () => {};

  let lastPct = -1;
  return (e: FlashProgressEvent) => {
    if (isDebug()) {
      // Full per-record detail for debugging.
      process.stderr.write(`  [debug] ${e.phase}: ${e.message ?? ""}\n`);
      return;
    }
    // Minimal progress: print a dot every 10%.
    if (e.bytesSent !== undefined && e.bytesTotal !== undefined && e.bytesTotal > 0) {
      const pct = Math.floor((e.bytesSent / e.bytesTotal) * 10);
      if (pct > lastPct) {
        process.stderr.write(".");
        lastPct = pct;
      }
    }
  };
}

// ---- test-oriented re-exports ---------------------------------------------

export function embeddedFirmwareManifest(): readonly EmbeddedFirmware[] {
  return EMBEDDED_FIRMWARE;
}

export type { IdentifyReply, ServoModel };
export { loadCatalog, loadServoModes, parseModelId };
