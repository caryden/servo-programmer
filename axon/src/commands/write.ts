/**
 * `axon write` — load a 95-byte config block from a file and write
 * it to the servo.
 *
 * v1 scaffold supports `--from <file.svo>` only. `--from <file.json>`
 * will be added once the byte→parameter mapping (docs/BYTE_MAPPING.md)
 * is complete and JSON round-trips can be implemented safely.
 *
 * Flow:
 *   1. Read current config from servo.
 *   2. Load new config from file.
 *   3. Show diff.
 *   4. Confirm (unless --yes or --dry-run).
 *   5. Write.
 *   6. Read back and verify.
 */

import { readFileSync } from "node:fs";
import {
  CONFIG_BLOCK_SIZE,
  readFullConfig,
  writeFullConfig,
  modelIdFromConfig,
} from "../driver/protocol.ts";
import { openDongle } from "../driver/hid.ts";
import { AxonError, ExitCode } from "../errors.ts";
import { confirm } from "../util/prompt.ts";
import type { GlobalFlags } from "../cli.ts";

export interface WriteFlags {
  from: string;
  dryRun: boolean;
}

export async function runWrite(
  global: GlobalFlags,
  local: WriteFlags,
): Promise<number> {
  // 1. Load the new config from disk
  const path = local.from;
  const lower = path.toLowerCase();
  if (lower.endsWith(".json") || lower === "-") {
    throw AxonError.validation(
      "--from <file.json> (and stdin) are not yet supported in v1 scaffold. " +
        "Use `axon write --from cfg.svo` (raw 95-byte vendor-compatible format) for now. " +
        "JSON round-trip will be added once the byte→parameter mapping is complete.",
    );
  }
  let newBytes: Buffer;
  try {
    newBytes = readFileSync(path);
  } catch (e) {
    throw AxonError.validation(
      `could not read ${path}: ${(e as Error).message}`,
    );
  }
  if (newBytes.length !== CONFIG_BLOCK_SIZE) {
    throw AxonError.validation(
      `${path} is ${newBytes.length} bytes, expected exactly ${CONFIG_BLOCK_SIZE} ` +
        `(a vendor .svo file).`,
    );
  }

  const handle = await openDongle();
  try {
    // 2. Read current config
    const currentBytes = await readFullConfig(handle);

    // 3. Compute diff
    const diffs: Array<{
      offset: number;
      before: number;
      after: number;
    }> = [];
    for (let i = 0; i < CONFIG_BLOCK_SIZE; i++) {
      if (currentBytes[i] !== newBytes[i]) {
        diffs.push({
          offset: i,
          before: currentBytes[i]!,
          after: newBytes[i]!,
        });
      }
    }

    // Model-id sanity check: refuse if target is for a different model
    const currentModel = modelIdFromConfig(currentBytes);
    const newModel = modelIdFromConfig(newBytes);
    if (newModel && newModel !== currentModel) {
      throw AxonError.validation(
        `${path} has model id "${newModel}" but the connected servo is "${currentModel}". ` +
          `Refusing to write a different model's config.`,
      );
    }

    if (diffs.length === 0) {
      if (!global.quiet) {
        process.stderr.write("No changes — file matches current config.\n");
      }
      return ExitCode.Ok;
    }

    // 4. Show diff
    showDiff(diffs, global);

    if (local.dryRun) {
      if (!global.quiet) {
        process.stderr.write("(--dry-run, not writing)\n");
      }
      return ExitCode.Ok;
    }

    // 5. Confirm
    if (!global.yes) {
      const ok = await confirm(`Write ${diffs.length} byte(s) to servo?`);
      if (!ok) {
        process.stderr.write("Aborted.\n");
        return ExitCode.Ok;
      }
    }

    // 6. Write
    await writeFullConfig(handle, newBytes);

    // 7. Read back and verify
    const verify = await readFullConfig(handle);
    let mismatches = 0;
    for (let i = 0; i < CONFIG_BLOCK_SIZE; i++) {
      if (verify[i] !== newBytes[i]) mismatches++;
    }
    if (mismatches > 0) {
      throw AxonError.servoIo(
        `write verification failed: ${mismatches} byte(s) read back wrong. ` +
          `Servo may be in an inconsistent state.`,
      );
    }

    if (!global.quiet) {
      process.stderr.write(`Wrote ${diffs.length} byte(s), verified.\n`);
    }
    return ExitCode.Ok;
  } finally {
    await handle.release();
  }
}

function showDiff(
  diffs: Array<{ offset: number; before: number; after: number }>,
  global: GlobalFlags,
): void {
  if (global.json) {
    process.stdout.write(
      JSON.stringify({
        changes: diffs.map((d) => ({
          offset: `0x${d.offset.toString(16).padStart(2, "0")}`,
          before: `0x${d.before.toString(16).padStart(2, "0")}`,
          after: `0x${d.after.toString(16).padStart(2, "0")}`,
        })),
        count: diffs.length,
      }) + "\n",
    );
    return;
  }
  process.stderr.write(`The following ${diffs.length} byte(s) will change:\n`);
  for (const d of diffs) {
    const off = `0x${d.offset.toString(16).padStart(2, "0")}`;
    const before = `0x${d.before.toString(16).padStart(2, "0")}`;
    const after = `0x${d.after.toString(16).padStart(2, "0")}`;
    process.stderr.write(`  ${off}    ${before} → ${after}\n`);
  }
}
