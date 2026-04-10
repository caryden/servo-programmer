/**
 * Loads the bundled servo_catalog.json (embedded at build time by Bun's
 * JSON import support) and exposes helpers to look up a model from the
 * raw 8-byte model id bytes at config offset 0x40..0x47.
 */

// Bun embeds this JSON into the compiled binary via `bun build --compile`.
// At dev time it's just a relative import.
import catalogJson from "../../data/servo_catalog.json" with { type: "json" };

export interface ParameterSpec {
  unit: string;
  description: string;
  docs_url?: string;
  values?: string[];
}

export interface BundledFirmware {
  file: string;
  sha256: string;
  description: string;
}

export interface ServoModel {
  id: string;
  name: string;
  max_range_deg: number | null;
  pulse_range_us: [number, number];
  docs_url?: string;
  magic_bytes?: string;
  defaults: Record<string, unknown>;
  bundled_firmware: Record<string, BundledFirmware>;
}

export interface Catalog {
  version: string;
  source_docs: string;
  models: Map<string, ServoModel>;
  parameters: Record<string, ParameterSpec>;
}

const rawCatalog = catalogJson as any;

/**
 * Parse the raw 8-byte model id from config offset 0x40..0x47 into a
 * clean ASCII string. Trailing '*' bytes are padding in the vendor
 * format; we preserve them in the model id so that SA33*** matches
 * exactly what the vendor exe stores. Null bytes are stripped.
 */
export function parseModelId(bytes: Uint8Array): string {
  if (bytes.length !== 8) {
    throw new Error(`model id must be exactly 8 bytes, got ${bytes.length}`);
  }
  let s = "";
  for (const b of bytes) {
    if (b === 0x00) break; // null-terminated padding
    s += String.fromCharCode(b);
  }
  return s;
}

/**
 * Build the in-memory catalog from the bundled JSON. Placeholder entries
 * in the JSON (keys starting with "_") are filtered out.
 */
export function loadCatalog(): Catalog {
  const models = new Map<string, ServoModel>();
  for (const [key, value] of Object.entries(rawCatalog.models) as [
    string,
    any,
  ][]) {
    if (key.startsWith("_")) continue;
    models.set(key, {
      id: key,
      name: value.name,
      max_range_deg: value.max_range_deg ?? null,
      pulse_range_us: value.pulse_range_us,
      docs_url: value.docs_url,
      magic_bytes: value.magic_bytes,
      defaults: value.defaults ?? {},
      bundled_firmware: value.bundled_firmware ?? {},
    });
  }
  return {
    version: rawCatalog.catalog_version,
    source_docs: rawCatalog.source_docs,
    models,
    parameters: rawCatalog.parameters ?? {},
  };
}

export function findModel(
  catalog: Catalog,
  modelId: string,
): ServoModel | undefined {
  return catalog.models.get(modelId);
}
