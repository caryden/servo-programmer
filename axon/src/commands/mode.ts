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

import { createHash } from "node:crypto";
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

  // Source the firmware bytes.
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
    const modeName = local.modeName!;
    if (!(modeName in model.bundled_firmware)) {
      const available = Object.keys(model.bundled_firmware).join(", ") || "(none)";
      throw AxonError.validation(
        `mode "${modeName}" is not a bundled firmware for ${modelId}. ` +
          `Available bundled modes: ${available}`,
      );
    }
    bundledModeKey = modeName;
    const entry = model.bundled_firmware[modeName]!;
    const embedded = findEmbeddedFirmware(modelId, modeName);
    if (!embedded || !embedded.available || embedded.base64 === null) {
      const reason = embedded?.reason ?? "not embedded in this build";
      throw AxonError.validation(
        `bundled firmware "${modeName}" for ${modelId} is not available in this build (${reason}). ` +
          `Either rebuild with the .sfw file present in downloads/, or pass --file <path> to supply it directly.`,
      );
    }
    sfwCiphertext = Buffer.from(embedded.base64, "base64");
    if (!verifySfwHash(sfwCiphertext, entry.sha256)) {
      throw AxonError.validation(
        `embedded firmware "${modeName}" for ${modelId} has hash ${sfwHashHex(sfwCiphertext)} ` +
          `but catalog expects ${entry.sha256}. Aborting (embed-sfw.ts drifted).`,
      );
    }
    sourceDescription = `bundled:${entry.file}`;
  }

  // Decrypt + parse.
  let decrypted: DecryptedSfw;
  try {
    decrypted = decryptSfw(sfwCiphertext);
  } catch (e) {
    throw AxonError.validation(`failed to decrypt ${sourceDescription}: ${(e as Error).message}`);
  }

  const fileHashHex = sfwHashHex(sfwCiphertext);

  // Show the big destructive-action warning + prompt for confirmation.
  const confirmed = await confirmFlashIntent({
    global,
    modelId,
    modelName: model.name,
    currentMode: id.mode,
    bundledModeKey,
    filePath: local.filePath ?? null,
    fileHashHex,
    firmwareHeader: decrypted.header.modelId,
    hexRecords: decrypted.hexRecords.length,
    sectorErases: decrypted.sectorErases.length,
  });
  if (!confirmed) {
    process.stderr.write("Aborted.\n");
    return ExitCode.Ok;
  }

  // Flash. flashFirmware internally cross-checks the .sfw @0801
  // header bytes against the boot-query reply — that's the "Error
  // 1030 Firmware is incorrect" guard in the vendor exe.
  // AXON_FLASH_CMD_SLEEP_MS is a test-only override that lets the
  // mode.test.ts suite skip the default 25 ms inter-command sleep.
  const cmdSleepOverride = Number.parseInt(process.env.AXON_FLASH_CMD_SLEEP_MS ?? "", 10);
  await flashFirmware(handle, decrypted, {
    expectedModelId: modelId,
    onProgress: makeProgressSink(global),
    cmdSleepMs: Number.isFinite(cmdSleepOverride) ? cmdSleepOverride : undefined,
  });

  // Re-identify to confirm the mode transition.
  const afterId = await identify(handle);
  if (!afterId.present) {
    process.stderr.write(
      "Flash completed but post-flash identify returned absent. " +
        "Replug the servo and re-run `axon status`.\n",
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
    process.stderr.write(`\nSuccess. ${modelId} mode: ${id.mode} → ${afterId.mode}\n`);
  }
  return ExitCode.Ok;
}

interface ConfirmArgs {
  global: GlobalFlags;
  modelId: string;
  modelName: string;
  currentMode: ServoMode;
  bundledModeKey: string | null;
  filePath: string | null;
  fileHashHex: string;
  firmwareHeader: string;
  hexRecords: number;
  sectorErases: number;
}

/**
 * Present a prominent destructive-action warning and require the
 * user to echo the mode name (or the file basename) back verbatim.
 * Even `--yes` / `-y` does NOT bypass this echo — the CLI design
 * document is explicit that flashing is a two-step confirmation.
 */
async function confirmFlashIntent(args: ConfirmArgs): Promise<boolean> {
  const echoTarget = args.bundledModeKey ?? (args.filePath !== null ? basename(args.filePath) : "");
  if (echoTarget.length === 0) {
    throw new Error("confirmFlashIntent: no echo target");
  }

  const w = (s: string) => process.stderr.write(s);
  w("\n");
  w("================================================================\n");
  w("  WARNING: About to flash firmware to your servo.\n");
  w("================================================================\n");
  w(`  servo      ${args.modelId} (${args.modelName})\n`);
  w(`  cur mode   ${args.currentMode}\n`);
  if (args.bundledModeKey !== null) {
    w(`  target     bundled/${args.bundledModeKey}\n`);
  } else {
    w(`  target     ${args.filePath}\n`);
  }
  w(
    `  firmware   model=${args.firmwareHeader}, ${args.hexRecords} hex records, ${args.sectorErases} sectors\n`,
  );
  w(`  sha256     ${args.fileHashHex}\n`);
  w("\n");
  w("  This will overwrite the firmware on your servo. It CANNOT be\n");
  w("  undone if you flash the wrong file. There is no rollback.\n");
  w("\n");
  if (args.filePath !== null) {
    w("  Since you are using --file (user-supplied .sfw), please verify\n");
    w("  the sha256 above against the source you downloaded it from\n");
    w("  (vendor docs, Discord, etc.) BEFORE continuing.\n\n");
  }
  w(`  To continue, type exactly: ${echoTarget}\n`);
  w("  Anything else aborts.\n");
  w("\n");
  w("confirm> ");

  // --yes is NOT a bypass — the user must still echo. This matches
  // the CLI_DESIGN.md spec for `axon mode set`.
  if (!process.stdin.isTTY) {
    // In tests and pipelines, an env-var bypass is provided. This
    // is NOT a --yes shortcut: the caller must still spell out the
    // echo target verbatim, and it's only consulted when stdin is
    // not a TTY (so interactive users still see the prompt).
    const envEcho = process.env.AXON_FLASH_CONFIRM ?? "";
    if (envEcho === echoTarget) {
      w(`\n(AXON_FLASH_CONFIRM matched; proceeding)\n`);
      return true;
    }
    w("\n(non-interactive stdin — refusing to flash without confirmation)\n");
    return false;
  }

  const answer = await readLine();
  if (answer.trim() !== echoTarget) {
    w(`(typed "${answer.trim()}", expected "${echoTarget}")\n`);
    return false;
  }
  return true;
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
  if (global.json) {
    // In --json mode the final summary is the only stdout output;
    // skip intermediate progress.
    return () => {};
  }
  if (global.quiet) {
    return () => {};
  }
  return (e: FlashProgressEvent) => {
    const pct =
      e.bytesSent !== undefined && e.bytesTotal !== undefined && e.bytesTotal > 0
        ? ` ${Math.floor((e.bytesSent / e.bytesTotal) * 100)}%`
        : "";
    const recs =
      e.recordsSent !== undefined && e.recordsTotal !== undefined
        ? ` [${e.recordsSent}/${e.recordsTotal}]`
        : "";
    process.stderr.write(`  ${e.phase}${pct}${recs}  ${e.message ?? ""}\n`);
  };
}

// ---- test-oriented re-exports ---------------------------------------------

export function embeddedFirmwareManifest(): readonly EmbeddedFirmware[] {
  return EMBEDDED_FIRMWARE;
}

export type { IdentifyReply, ServoModel };
// Expose a couple of catalog loaders so test fixtures can assert on
// the same data shapes without going through the disk-reading code.
export { loadCatalog, loadServoModes, parseModelId };

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
