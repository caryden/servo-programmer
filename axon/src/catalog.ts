/**
 * Loads the bundled servo_catalog.json (embedded at build time by Bun's
 * JSON import support) and exposes helpers to look up a model from the
 * raw 8-byte model id bytes at config offset 0x40..0x47.
 *
 * Schema version 2 introduces an audience-separated structure: every
 * parameter has user-facing top-level fields (vendor_label, description,
 * unit, modes, min, max, values, docs_url) and a separate
 * `implementation` nested object. Loaders here preserve both layers;
 * CLI rendering MUST only read the user-facing fields.
 */

// Bun embeds this JSON into the compiled binary via `bun build --compile`.
// At dev time it's just a relative import.
import catalogJson from "../../data/servo_catalog.json" with { type: "json" };

export interface ParameterImplementation {
  offset?: string;
  mirrors?: string[];
  encoding?: string;
  widget?: string;
  confidence?: string;
  label_confidence?: string;
  confidence_note?: string;
  bit_mask?: string;
  min_raw?: number;
  max_raw?: number;
  deg_formula?: string;
  us_formula?: string;
  percent_formula?: string;
  user_step_formula?: string;
  source?: string;
  notes?: string;
  value_mapping_confidence?: string;
  value_mapping_note?: string;
  mirror_0x0F_offset?: number;
  [key: string]: unknown;
}

export interface CatalogParameterSpec {
  name: string;
  vendor_label: string;
  description: string;
  unit: string;
  modes: string[];
  min?: number | null;
  max?: number | null;
  max_from_model?: string;
  values?: string[];
  docs_url?: string;
  implementation: ParameterImplementation;
}

export interface NotYetMappedEntry {
  name: string;
  vendor_label: string;
  description: string;
  modes: string[];
  reason_blocked: string;
}

export interface ServoModeSpec {
  id: string;
  id_byte: number;
  name: string;
  description: string;
  sfw_pattern?: string;
  available_parameters: string[];
  unavailable_parameters?: Record<string, string>;
}

export interface BundledFirmware {
  file: string;
  sha256: string;
  description: string;
}

/**
 * Per-model default for a parameter. Can be a primitive (e.g. "normal"
 * for the inversion enum) or a structured `{raw, …}` object whose
 * user-facing fields live alongside a nested `implementation`.
 */
export type ModelDefaultValue =
  | string
  | number
  | boolean
  | null
  | {
      raw?: number;
      user_step?: number;
      percent_approx?: number;
      us?: number;
      deg_approx?: number;
      mode?: string | null;
      implementation?: Record<string, unknown>;
      [key: string]: unknown;
    };

export interface ServoModel {
  id: string;
  name: string;
  max_range_deg: number | null;
  pulse_range_us: [number, number];
  docs_url?: string;
  magic_bytes?: string;
  defaults: Record<string, ModelDefaultValue>;
  bundled_firmware: Record<string, BundledFirmware>;
}

export interface Catalog {
  version: string;
  source_docs: string;
  models: Map<string, ServoModel>;
  /**
   * Raw parameter entries straight out of the JSON. Prefer
   * `loadParameters()` for typed access.
   */
  parameters: Record<string, unknown>;
}

const rawCatalog = catalogJson as unknown as {
  catalog_version: string;
  source_docs: string;
  models: Record<string, Record<string, unknown>>;
  parameters: Record<string, Record<string, unknown>>;
  servo_modes: Record<string, Record<string, unknown>>;
  _not_yet_mapped: Record<string, unknown>;
};

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
  for (const [key, value] of Object.entries(rawCatalog.models)) {
    if (key.startsWith("_")) continue;
    const v = value as {
      name: string;
      max_range_deg: number | null;
      pulse_range_us: [number, number];
      docs_url?: string;
      implementation?: { magic_bytes?: string };
      defaults?: Record<string, ModelDefaultValue>;
      bundled_firmware?: Record<string, BundledFirmware>;
    };
    models.set(key, {
      id: key,
      name: v.name,
      max_range_deg: v.max_range_deg ?? null,
      pulse_range_us: v.pulse_range_us,
      docs_url: v.docs_url,
      magic_bytes: v.implementation?.magic_bytes,
      defaults: v.defaults ?? {},
      bundled_firmware: v.bundled_firmware ?? {},
    });
  }
  return {
    version: rawCatalog.catalog_version,
    source_docs: rawCatalog.source_docs,
    models,
    parameters: rawCatalog.parameters ?? {},
  };
}

export function findModel(catalog: Catalog, modelId: string): ServoModel | undefined {
  return catalog.models.get(modelId);
}

// ---------------------------------------------------------------------
// Schema v2 helpers: parameters, servo modes, _not_yet_mapped
// ---------------------------------------------------------------------

/**
 * Return the set of schema-v2 parameter entries (user-facing fields +
 * the nested implementation object). Entries with "_"-prefixed keys
 * are filtered out.
 */
export function loadParameters(): CatalogParameterSpec[] {
  const out: CatalogParameterSpec[] = [];
  for (const [name, raw] of Object.entries(rawCatalog.parameters ?? {})) {
    if (name.startsWith("_")) continue;
    const v = raw as {
      vendor_label: string;
      description: string;
      unit: string;
      modes: string[];
      min?: number | null;
      max?: number | null;
      max_from_model?: string;
      values?: string[];
      docs_url?: string;
      implementation?: ParameterImplementation;
    };
    out.push({
      name,
      vendor_label: v.vendor_label,
      description: v.description,
      unit: v.unit,
      modes: v.modes ?? [],
      min: v.min ?? null,
      max: v.max ?? null,
      max_from_model: v.max_from_model,
      values: v.values,
      docs_url: v.docs_url,
      implementation: v.implementation ?? {},
    });
  }
  return out;
}

export function findParameter(name: string): CatalogParameterSpec | undefined {
  const all = loadParameters();
  return all.find((p) => p.name === name);
}

export function loadServoModes(): ServoModeSpec[] {
  const out: ServoModeSpec[] = [];
  for (const [id, raw] of Object.entries(rawCatalog.servo_modes ?? {})) {
    if (id.startsWith("_")) continue;
    const v = raw as {
      id_byte: number;
      name: string;
      description: string;
      sfw_pattern?: string;
      available_parameters: string[];
      unavailable_parameters?: Record<string, string>;
    };
    out.push({
      id,
      id_byte: v.id_byte,
      name: v.name,
      description: v.description,
      sfw_pattern: v.sfw_pattern,
      available_parameters: v.available_parameters ?? [],
      unavailable_parameters: v.unavailable_parameters,
    });
  }
  return out;
}

export function findServoMode(id_byte: number): ServoModeSpec | undefined {
  return loadServoModes().find((m) => m.id_byte === id_byte);
}

export function loadNotYetMapped(): Record<string, NotYetMappedEntry> {
  const out: Record<string, NotYetMappedEntry> = {};
  for (const [name, raw] of Object.entries(rawCatalog._not_yet_mapped ?? {})) {
    if (name.startsWith("_")) continue;
    const v = raw as {
      vendor_label: string;
      description: string;
      modes: string[];
      implementation?: { reason_blocked?: string };
    };
    out[name] = {
      name,
      vendor_label: v.vendor_label,
      description: v.description,
      modes: v.modes ?? [],
      reason_blocked: v.implementation?.reason_blocked ?? "not yet mapped",
    };
  }
  return out;
}

export function isNotYetMapped(name: string): boolean {
  return name in loadNotYetMapped();
}
