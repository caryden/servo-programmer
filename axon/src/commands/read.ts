/**
 * `axon read` — read the full 95-byte config block and emit it.
 *
 * Output modes:
 *   (default)   human-readable summary
 *   --json      full model as JSON
 *   --svo       raw 95 bytes to stdout (vendor-compatible)
 *   --hex       annotated hex dump (debug)
 */

import { findModel, loadCatalog } from "../catalog.ts";
import type { GlobalFlags } from "../cli.ts";
import { openDongle } from "../driver/hid.ts";
import { modelIdFromConfig, readFullConfig } from "../driver/protocol.ts";
import { ExitCode } from "../errors.ts";

export interface ReadFlags {
  format: "human" | "json" | "svo" | "hex";
}

export async function runRead(global: GlobalFlags, local: ReadFlags): Promise<number> {
  const handle = await openDongle();
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
    emitJson(config);
    return ExitCode.Ok;
  }
  emitHuman(config, global);
  return ExitCode.Ok;
}

function emitJson(config: Buffer): void {
  const modelId = modelIdFromConfig(config);
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);
  const result = {
    model: {
      id: modelId,
      name: model?.name ?? null,
      known: !!model,
      docs_url: model?.docs_url ?? null,
    },
    raw_bytes_hex: config.toString("hex"),
    byte_count: config.length,
    parameters: {
      _note: "Named parameters not yet implemented in v1 scaffold. See docs/BYTE_MAPPING.md.",
    },
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function emitHuman(config: Buffer, _global: GlobalFlags): void {
  const modelId = modelIdFromConfig(config);
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);

  process.stdout.write(`model      ${modelId}`);
  if (model?.name) process.stdout.write(`  (${model.name})`);
  if (!model) process.stdout.write(`  [unknown to catalog]`);
  process.stdout.write("\n");
  if (model?.docs_url) {
    process.stdout.write(`docs       ${model.docs_url}\n`);
  }
  process.stdout.write(
    `block      ${config.length} bytes (magic ${config.subarray(0, 4).toString("hex")})\n`,
  );
  process.stdout.write("\n");
  process.stdout.write(
    "Named parameters not yet shown in v1 scaffold.\n" +
      "Use `axon read --svo > cfg.svo` to save the block, or\n" +
      "`axon read --hex` to see the raw byte layout.\n",
  );
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
