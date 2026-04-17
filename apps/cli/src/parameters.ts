/**
 * Named parameter registry and per-parameter read/write logic.
 *
 * This module is the bridge between the raw 95-byte config block and
 * the user-visible named-parameter surface ('axon get' / 'axon set').
 * Every parameter definition captures:
 *
 *   - user-facing metadata (vendor label, description, unit, modes,
 *     min/max/values, docs_url) — safe to render in help text
 *   - implementation metadata (byte offsets, encoding, formulas) —
 *     kept internal, NEVER rendered in end-user output
 *   - read/write/parse/validate functions
 *
 * Parameter byte layouts and encodings come from
 * `data/servo_catalog.json` (which is in turn derived from the vendor
 * exe decomp plus A/B .svo diffs — see docs/BYTE_MAPPING.md).
 */

import {
  type CatalogParameterSpec,
  findParameter as findCatalogParameter,
  findModel,
  isNotYetMapped,
  loadCatalog,
  loadParameters as loadCatalogParameters,
  loadNotYetMapped,
  type ModelDefaultValue,
} from "./catalog.ts";
import { AxonError } from "./errors.ts";
import { cloneBuffer } from "./util/bytes.ts";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

/**
 * The value of a parameter, decoded from a config block. `raw` is the
 * raw byte(s) as stored on the wire; `physical` is the human-readable
 * decoded form (degrees / microseconds / percent / enum / etc.).
 */
export interface ParameterValue {
  raw: number | number[];
  physical?: number | string | boolean;
  unit?: string;
  is_default?: boolean;
  notes?: string;
}

export interface ParameterSpec {
  name: string;
  vendorLabel: string;
  description: string;
  unit: string;
  modes: string[];
  min?: number | null;
  max?: number | null;
  values?: string[];
  docsUrl?: string;

  /** For help/debug; NOT rendered in user-facing output. */
  offset?: string;
  encoding?: string;

  /** Decode the parameter value from a config buffer. */
  read(config: Buffer, modelId: string): ParameterValue;

  /** Return a NEW buffer with this parameter written. */
  write(config: Buffer, value: unknown, modelId: string): Buffer;

  /** Parse a user-supplied string into the canonical value type. Throws on bad input. */
  parseUserInput(input: string, modelId: string): unknown;

  /** Validate a parsed value. Returns null on OK, an error message string otherwise. */
  validate(value: unknown, modelId: string): string | null;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function maxRangeDeg(modelId: string): number {
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);
  if (!model || model.max_range_deg == null) {
    // Fall back to a sane default. We never actually encounter this
    // in practice because the CLI refuses to operate on unknown
    // models — but keep the math well-defined rather than NaN.
    return 355;
  }
  return model.max_range_deg;
}

function cloneConfig(config: Buffer): Buffer {
  return cloneBuffer(config);
}

function requireCatalogEntry(name: string): CatalogParameterSpec {
  const entry = findCatalogParameter(name);
  if (!entry) {
    throw new Error(
      `parameters.ts: no catalog entry for '${name}' — did the catalog schema change?`,
    );
  }
  return entry;
}

// ---------------------------------------------------------------------
// Parameter implementations
// ---------------------------------------------------------------------

/**
 * servo_angle — u8 at byte 0x04 (mirrored at 0x05).
 * Vendor formula: deg = raw * (max_range_deg / 255).
 * Confirmed by vendor exe screenshot: "Servo Angle: 220" → byte[0x04] = 0xDC = 220.
 *
 * Previously incorrectly mapped to 0x0A:0x0B (that's dampening_factor).
 */
function buildServoAngle(): ParameterSpec {
  const entry = requireCatalogEntry("servo_angle");
  return {
    name: "servo_angle",
    vendorLabel: entry.vendor_label,
    description: entry.description,
    unit: entry.unit,
    modes: entry.modes,
    min: entry.min ?? 0,
    max: null,
    values: entry.values,
    docsUrl: entry.docs_url,
    offset: entry.implementation.offset,
    encoding: entry.implementation.encoding,

    read(config, _modelId) {
      const raw = config[0x04] ?? 0;
      return { raw, physical: raw, unit: "raw" };
    },

    write(config, value, _modelId) {
      const raw = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(raw)) {
        throw AxonError.validation(
          `servo_angle: value must be a number, got ${JSON.stringify(value)}`,
        );
      }
      if (raw < 0 || raw > 255) {
        throw AxonError.validation(`servo_angle: ${raw} out of range (0..255).`);
      }
      const v = clamp(Math.round(raw), 0, 255);
      const out = cloneConfig(config);
      out[0x04] = v;
      out[0x05] = v; // mirror
      return out;
    },

    parseUserInput(input) {
      const n = Number(input.trim());
      if (!Number.isFinite(n)) {
        throw AxonError.validation(`servo_angle: could not parse '${input}'.`);
      }
      return n;
    },

    validate(value, _modelId) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return "servo_angle: value must be a number (0-255 raw).";
      }
      if (value < 0 || value > 255) {
        return `servo_angle: ${value} out of range (0..255).`;
      }
      return null;
    },
  };
}

/**
 * servo_neutral — u8 at 0x06 with encoding stored = user_us + 0x80.
 * User-facing range is -127..+127 µs offset from the 1500 µs center.
 */
function buildServoNeutral(): ParameterSpec {
  const entry = requireCatalogEntry("servo_neutral");
  return {
    name: "servo_neutral",
    vendorLabel: entry.vendor_label,
    description: entry.description,
    unit: entry.unit,
    modes: entry.modes,
    min: entry.min ?? -127,
    max: entry.max ?? 127,
    docsUrl: entry.docs_url,
    offset: entry.implementation.offset,
    encoding: entry.implementation.encoding,

    read(config) {
      const raw = config[0x06] ?? 0x80;
      const us = raw - 128;
      return {
        raw,
        physical: us,
        unit: "us",
      };
    },

    write(config, value) {
      const us = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(us)) {
        throw AxonError.validation(
          `servo_neutral: value must be a number of microseconds, got ${JSON.stringify(value)}`,
        );
      }
      if (us < -127 || us > 127) {
        throw AxonError.validation(`servo_neutral: ${us} µs out of range (-127..+127 µs).`);
      }
      const raw = clamp(Math.round(us) + 128, 1, 255);
      const out = cloneConfig(config);
      out[0x06] = raw;
      return out;
    },

    parseUserInput(input) {
      const trimmed = input.trim().replace(/\s*(us|µs)\s*$/i, "");
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        throw AxonError.validation(
          `servo_neutral: could not parse '${input}' as a number of microseconds.`,
        );
      }
      return n;
    },

    validate(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return "servo_neutral: value must be a number of microseconds.";
      }
      if (value < -127 || value > 127) {
        return `servo_neutral: ${value} µs out of range (-127..+127).`;
      }
      return null;
    },
  };
}

/**
 * sensitivity — u8 at 0x0C with encoding stored = (user_step + 1) * 16.
 * User-facing range is 0..14 (step 0 = ultra high, 1 µs dead-band).
 */
function buildSensitivity(): ParameterSpec {
  const entry = requireCatalogEntry("sensitivity");
  return {
    name: "sensitivity",
    vendorLabel: entry.vendor_label,
    description: entry.description,
    unit: entry.unit,
    modes: entry.modes,
    min: entry.min ?? 0,
    max: entry.max ?? 14,
    docsUrl: entry.docs_url,
    offset: entry.implementation.offset,
    encoding: entry.implementation.encoding,

    read(config) {
      const raw = config[0x0c] ?? 0x10;
      const step = Math.floor(raw / 16) - 1;
      return {
        raw,
        physical: step,
        unit: "step",
      };
    },

    write(config, value) {
      const step = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(step)) {
        throw AxonError.validation(
          `sensitivity: value must be an integer step 0..14, got ${JSON.stringify(value)}`,
        );
      }
      if (step < 0 || step > 14) {
        throw AxonError.validation(`sensitivity: ${step} out of range (0..14).`);
      }
      const raw = (step + 1) * 16;
      const out = cloneConfig(config);
      out[0x0c] = raw;
      return out;
    },

    parseUserInput(input) {
      const trimmed = input.trim().replace(/\s*step\s*$/i, "");
      const n = Number(trimmed);
      if (!Number.isInteger(n)) {
        throw AxonError.validation(`sensitivity: could not parse '${input}' as an integer step.`);
      }
      return n;
    },

    validate(value) {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return "sensitivity: value must be an integer step 0..14.";
      }
      if (value < 0 || value > 14) {
        return `sensitivity: ${value} out of range (0..14).`;
      }
      return null;
    },
  };
}

/**
 * inversion — bit 0x02 of the flags byte at 0x25. Value set → "reversed".
 */
function buildInversion(): ParameterSpec {
  const entry = requireCatalogEntry("inversion");
  return {
    name: "inversion",
    vendorLabel: entry.vendor_label,
    description: entry.description,
    unit: entry.unit,
    modes: entry.modes,
    values: entry.values,
    docsUrl: entry.docs_url,
    offset: entry.implementation.offset,
    encoding: entry.implementation.encoding,

    read(config) {
      const raw = config[0x25] ?? 0;
      const bit = (raw & 0x02) !== 0;
      return {
        raw,
        physical: bit ? "reversed" : "normal",
        unit: "enum",
      };
    },

    write(config, value) {
      if (value !== "normal" && value !== "reversed") {
        throw AxonError.validation(
          `inversion: value must be 'normal' or 'reversed', got ${JSON.stringify(value)}`,
        );
      }
      const out = cloneConfig(config);
      const current = out[0x25] ?? 0;
      if (value === "reversed") {
        out[0x25] = current | 0x02;
      } else {
        out[0x25] = current & ~0x02;
      }
      return out;
    },

    parseUserInput(input) {
      const trimmed = input.trim().toLowerCase();
      if (trimmed === "normal" || trimmed === "reversed") return trimmed;
      throw AxonError.validation(
        `inversion: value must be 'normal' or 'reversed', got '${input}'.`,
      );
    },

    validate(value) {
      if (value !== "normal" && value !== "reversed") {
        return "inversion: value must be 'normal' or 'reversed'.";
      }
      return null;
    },
  };
}

/**
 * loose_pwm_protection — two bits 0x60 in the flags byte at 0x25.
 * READ-ONLY in v1.0: we know the bit location but not which numeric
 * bit value maps to release/hold/neutral. Write is rejected.
 */
/**
 * loose_pwm_protection — byte 0x25 bits 0x60.
 * Confirmed by load-to-UI decomp (FUN_00404b28 lines 102-112):
 *   bits 0x00 → dropdown index 0 → release
 *   bits 0x40 → dropdown index 1 → hold
 *   bits 0x60 → dropdown index 2 → neutral
 * Vendor exe shows "Go Neutral Position" in the screenshot.
 */
const LOOSE_PWM_MODES = ["release", "hold", "neutral"] as const;
type LoosePwmMode = (typeof LOOSE_PWM_MODES)[number];
const LOOSE_PWM_BITS: Record<LoosePwmMode, number> = { release: 0x00, hold: 0x40, neutral: 0x60 };
const BITS_TO_MODE = new Map<number, LoosePwmMode>([
  [0x00, "release"],
  [0x40, "hold"],
  [0x60, "neutral"],
]);

function buildLoosePwmProtection(): ParameterSpec {
  const entry = requireCatalogEntry("loose_pwm_protection");
  return {
    name: "loose_pwm_protection",
    vendorLabel: entry.vendor_label,
    description: entry.description,
    unit: entry.unit,
    modes: entry.modes,
    values: entry.values,
    docsUrl: entry.docs_url,
    offset: entry.implementation.offset,
    encoding: entry.implementation.encoding,

    read(config) {
      const raw = config[0x25] ?? 0;
      const bits = raw & 0x60;
      const mode = BITS_TO_MODE.get(bits) ?? "release";
      return { raw: bits >> 5, physical: mode, unit: "enum" };
    },

    write(config, value) {
      const mode = String(value) as LoosePwmMode;
      const bits = LOOSE_PWM_BITS[mode];
      if (bits === undefined) {
        throw AxonError.validation(
          `loose_pwm_protection: '${value}' is not valid. Use: release, hold, or neutral.`,
        );
      }
      const out = cloneConfig(config);
      out[0x25] = ((out[0x25] ?? 0) & ~0x60) | bits;
      return out;
    },

    parseUserInput(input) {
      const v = input.trim().toLowerCase();
      if (!LOOSE_PWM_MODES.includes(v as LoosePwmMode)) {
        throw AxonError.validation(
          `loose_pwm_protection: '${input}' is not valid. Use: release, hold, or neutral.`,
        );
      }
      return v;
    },

    validate(value) {
      if (!LOOSE_PWM_MODES.includes(String(value) as LoosePwmMode)) {
        return `loose_pwm_protection: '${value}' is not valid. Use: release, hold, or neutral.`;
      }
      return null;
    },
  };
}

/**
 * dampening_factor — BE-u16 at 0x0A:0x0B, mirrored at 0x27:0x28,
 * 0x29:0x2A, 0x2B:0x2C. Confirmed by .svo A/B diff: vendor exe
 * "Damping Factor: 166" → 0x0A:0x0B = 0x00A6 = 166.
 * Previously we had this mapped as servo_angle (wrong).
 */
function buildDampeningFactor(): ParameterSpec {
  return {
    name: "dampening_factor",
    vendorLabel: "Dampening Factor",
    description: "PID D coefficient. Higher = more damping near target position.",
    unit: "raw",
    modes: ["servo_mode"],
    docsUrl: undefined,
    offset: "0x0A",
    encoding: "be_u16",

    read(config) {
      const raw = ((config[0x0a] ?? 0) << 8) | (config[0x0b] ?? 0);
      return { raw, physical: raw, unit: "raw" };
    },

    write(config, value) {
      const raw = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(raw) || raw < 0 || raw > 65535) {
        throw AxonError.validation(`dampening_factor: ${raw} out of range (0..65535).`);
      }
      const v = clamp(Math.round(raw), 0, 65535);
      const hi = (v >> 8) & 0xff;
      const lo = v & 0xff;
      const out = cloneConfig(config);
      for (const addr of [0x0a, 0x27, 0x29, 0x2b] as const) {
        out[addr] = hi;
        out[addr + 1] = lo;
      }
      return out;
    },

    parseUserInput(input) {
      const n = Number(input.trim());
      if (!Number.isFinite(n)) {
        throw AxonError.validation(`dampening_factor: could not parse '${input}'.`);
      }
      return n;
    },

    validate(value) {
      if (typeof value !== "number" || !Number.isFinite(value))
        return "dampening_factor: value must be a number.";
      if (value < 0 || value > 65535) return `dampening_factor: ${value} out of range (0..65535).`;
      return null;
    },
  };
}

/**
 * soft_start — byte 0x25 bit 0x10. Boolean checkbox.
 * Confirmed by .svo A/B diff: soft start ON → bit set, OFF → bit clear.
 */
function buildSoftStart(): ParameterSpec {
  return {
    name: "soft_start",
    vendorLabel: "Soft Start",
    description: "Limits acceleration on startup to prevent sudden motion.",
    unit: "enum",
    modes: ["servo_mode"],
    values: ["on", "off"],
    docsUrl: undefined,
    offset: "0x25 bit 0x10",
    encoding: "bitfield",

    read(config) {
      const raw = config[0x25] ?? 0;
      const on = (raw & 0x10) !== 0;
      return { raw: on ? 1 : 0, physical: on ? "on" : "off", unit: "enum" };
    },

    write(config, value) {
      const on = value === true || value === "on" || value === 1;
      const out = cloneConfig(config);
      if (on) {
        out[0x25] = (out[0x25] ?? 0) | 0x10;
      } else {
        out[0x25] = (out[0x25] ?? 0) & ~0x10;
      }
      return out;
    },

    parseUserInput(input) {
      const v = input.trim().toLowerCase();
      if (v === "on" || v === "true" || v === "1") return "on";
      if (v === "off" || v === "false" || v === "0") return "off";
      throw AxonError.validation(`soft_start: '${input}' is not valid. Use: on or off.`);
    },

    validate(value) {
      const v = String(value).toLowerCase();
      if (v !== "on" && v !== "off") return `soft_start: '${value}' is not valid. Use: on or off.`;
      return null;
    },
  };
}

/**
 * overload_protection — byte 0x25 bit 0x80 (enable) + bytes 0x35-0x3A
 * (3 levels × (power_u8, time_u8)).
 *
 * Encoding confirmed by .svo A/B diff:
 *   0x35 = Level 1 power (raw/255*100 = percent)
 *   0x36 = Level 1 time  (raw*0.1 = seconds)
 *   0x37 = Level 2 power
 *   0x38 = Level 2 time
 *   0x39 = Level 3 power
 *   0x3A = Level 3 time
 *
 * Note: byte 0x36 is dual-use — ProPTL in CR mode, Level 1 time
 * in Servo mode. Vendor enforces ~29% min on power (raw ~73).
 */
function buildOverloadProtection(): ParameterSpec {
  return {
    name: "overload_protection",
    vendorLabel: "Overload Protection",
    description:
      "Reduces power when stalled. 3 levels. Use 'on'/'off' to toggle, or 'overload_level1..3' to set individual levels.",
    unit: "enum",
    modes: ["servo_mode"],
    values: ["on", "off"],
    docsUrl: undefined,
    offset: "0x25 bit 0x80 + 0x35-0x3A",
    encoding: "bitfield + 3×(u8,u8)",

    read(config) {
      const enabled = ((config[0x25] ?? 0) & 0x80) !== 0;
      const levels = [];
      for (let i = 0; i < 3; i++) {
        const pwr = config[0x35 + i * 2] ?? 0;
        const time = config[0x36 + i * 2] ?? 0;
        levels.push({
          pct: Math.round(((pwr * 100) / 255) * 10) / 10,
          sec: Math.round(time * 0.1 * 10) / 10,
        });
      }
      const summary = enabled
        ? `on  ${levels.map((level, i) => `L${i + 1}: ${level.pct}%/${level.sec}s`).join("  ")}`
        : "off";
      return { raw: enabled ? 1 : 0, physical: summary, unit: "enum" };
    },

    write(config, value) {
      const v = String(value).toLowerCase();
      if (v === "on" || v === "off") {
        const out = cloneConfig(config);
        if (v === "on") out[0x25] = (out[0x25] ?? 0) | 0x80;
        else out[0x25] = (out[0x25] ?? 0) & ~0x80;
        return out;
      }
      throw AxonError.validation(
        "overload_protection: use 'on'/'off'. Set levels with overload_level1..3.",
      );
    },

    parseUserInput(input) {
      const v = input.trim().toLowerCase();
      if (v === "on" || v === "true" || v === "1") return "on";
      if (v === "off" || v === "false" || v === "0") return "off";
      throw AxonError.validation(`overload_protection: '${input}' is not valid. Use: on or off.`);
    },

    validate(value) {
      const v = String(value).toLowerCase();
      if (v !== "on" && v !== "off") return `overload_protection: use 'on' or 'off'.`;
      return null;
    },
  };
}

/** Build an overload level parameter (power% + time at one stage). */
function buildOverloadLevel(level: 1 | 2 | 3): ParameterSpec {
  const pwrOffset = 0x35 + (level - 1) * 2;
  const timeOffset = 0x36 + (level - 1) * 2;
  const name = `overload_level${level}`;
  return {
    name,
    vendorLabel: `Overload Level ${level}`,
    description: `Overload stage ${level}. Format: <power%> <time_seconds>. Power min 10%, time max 25.5s.`,
    unit: "compound",
    modes: ["servo_mode"],
    docsUrl: undefined,
    offset: `0x${pwrOffset.toString(16)}+0x${timeOffset.toString(16)}`,
    encoding: "u8 pair",

    read(config) {
      const pwr = config[pwrOffset] ?? 0;
      const time = config[timeOffset] ?? 0;
      const pct = Math.round(((pwr * 100) / 255) * 10) / 10;
      const sec = Math.round(time * 0.1 * 10) / 10;
      return { raw: pwr * 256 + time, physical: `${pct}% / ${sec}s`, unit: "compound" };
    },

    write(config, value) {
      const { pct, sec } = parseOverloadLevel(name, value);
      const rawPwr = clamp(Math.round((pct * 255) / 100), 0, 255);
      const rawTime = clamp(Math.round(sec / 0.1), 0, 255);
      const out = cloneConfig(config);
      out[pwrOffset] = rawPwr;
      out[timeOffset] = rawTime;
      return out;
    },

    parseUserInput(input) {
      parseOverloadLevel(name, input); // validate
      return input.trim();
    },

    validate(value) {
      try {
        parseOverloadLevel(name, value);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
  };
}

function parseOverloadLevel(name: string, value: unknown): { pct: number; sec: number } {
  const s = String(value).trim().replace(/%/g, "").replace(/s/gi, "");
  const parts = s.split(/\s+/);
  if (parts.length !== 2) {
    throw AxonError.validation(`${name}: expected '<power%> <time_s>', e.g. '50 5.0'`);
  }
  const pct = Number(parts[0]);
  const sec = Number(parts[1]);
  if (!Number.isFinite(pct) || pct < 10 || pct > 100) {
    throw AxonError.validation(`${name}: power ${pct}% out of range (10..100).`);
  }
  if (!Number.isFinite(sec) || sec < 0 || sec > 25.5) {
    throw AxonError.validation(`${name}: time ${sec}s out of range (0..25.5).`);
  }
  return { pct, sec };
}

/**
 * pwm_power — u8 at 0x11 mirrored at 0x12, 0x13, and 0x0F (= primary − 20).
 * User-facing unit is percent (0..100).
 */
function buildPwmPower(): ParameterSpec {
  const entry = requireCatalogEntry("pwm_power");
  return {
    name: "pwm_power",
    vendorLabel: entry.vendor_label,
    description: entry.description,
    unit: entry.unit,
    modes: entry.modes,
    min: entry.min ?? 0,
    max: entry.max ?? 100,
    docsUrl: entry.docs_url,
    offset: entry.implementation.offset,
    encoding: entry.implementation.encoding,

    read(config) {
      const raw = config[0x11] ?? 0;
      const percent = Math.round((raw * 100) / 255);
      return {
        raw,
        physical: percent,
        unit: "percent",
      };
    },

    write(config, value) {
      const pct = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(pct)) {
        throw AxonError.validation(
          `pwm_power: value must be a number of percent, got ${JSON.stringify(value)}`,
        );
      }
      if (pct < 0 || pct > 100) {
        throw AxonError.validation(`pwm_power: ${pct}% out of range (0..100).`);
      }
      const primary = clamp(Math.round((pct * 255) / 100), 0, 255);
      const out = cloneConfig(config);
      out[0x11] = primary;
      out[0x12] = primary;
      out[0x13] = primary;
      out[0x0f] = Math.max(0, primary - 20);
      return out;
    },

    parseUserInput(input) {
      const trimmed = input
        .trim()
        .replace(/\s*%\s*$/, "")
        .replace(/\s*percent\s*$/i, "");
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        throw AxonError.validation(`pwm_power: could not parse '${input}' as a number of percent.`);
      }
      return n;
    },

    validate(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return "pwm_power: value must be a number of percent.";
      }
      if (value < 0 || value > 100) {
        return `pwm_power: ${value}% out of range (0..100).`;
      }
      return null;
    },
  };
}

/**
 * proptl — byte 0x36, raw * 0.1 = seconds. CR Mode only.
 * Overheat-prevention timeout that cuts servo output after continuous
 * operation for this long. Max 25.5 s (raw 0xFF).
 * Confirmed by vendor exe screenshot + Micro CR capture.
 * Byte 0x36 is dual-use: overload/advanced in Servo Mode, ProPTL in CR Mode.
 */
function buildProptl(): ParameterSpec {
  return {
    name: "proptl",
    vendorLabel: "ProPTL",
    description:
      "Overheat-prevention timeout in seconds. Cuts servo output after continuous operation for this long.",
    unit: "s",
    modes: ["cr_mode"],
    min: 0,
    max: 25.5,
    docsUrl: undefined,
    offset: "0x36",
    encoding: "u8",

    read(config) {
      const raw = config[0x36] ?? 0;
      const seconds = raw * 0.1;
      return { raw, physical: Number(seconds.toFixed(1)), unit: "s" };
    },

    write(config, value) {
      const seconds = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 25.5) {
        throw AxonError.validation(`proptl: ${seconds} out of range (0..25.5 seconds).`);
      }
      const raw = clamp(Math.round(seconds / 0.1), 0, 255);
      const out = cloneConfig(config);
      out[0x36] = raw;
      return out;
    },

    parseUserInput(input) {
      const trimmed = input.trim().replace(/\s*s\s*$/i, "");
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        throw AxonError.validation(`proptl: could not parse '${input}' as seconds.`);
      }
      return n;
    },

    validate(value) {
      if (typeof value !== "number" || !Number.isFinite(value))
        return "proptl: value must be a number of seconds.";
      if (value < 0 || value > 25.5) return `proptl: ${value}s out of range (0..25.5).`;
      return null;
    },
  };
}

// ---------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------

let cachedRegistry: ParameterSpec[] | null = null;

function buildRegistry(): ParameterSpec[] {
  return [
    buildServoAngle(),
    buildServoNeutral(),
    buildDampeningFactor(),
    buildSensitivity(),
    buildInversion(),
    buildLoosePwmProtection(),
    buildPwmPower(),
    buildSoftStart(),
    buildOverloadProtection(),
    buildOverloadLevel(1),
    buildOverloadLevel(2),
    buildOverloadLevel(3),
    buildProptl(),
  ];
}

export function listParameters(): ParameterSpec[] {
  if (cachedRegistry === null) cachedRegistry = buildRegistry();
  return cachedRegistry;
}

export function findParameter(name: string): ParameterSpec | undefined {
  return listParameters().find((p) => p.name === name);
}

/**
 * Is `name` a canonical V1.3 parameter that we've documented but not
 * yet mapped to a specific byte? Checked by 'get'/'set' BEFORE the
 * "unknown parameter" path so users get a meaningful explanation.
 */
export function isParameterNotYetMapped(name: string): boolean {
  return isNotYetMapped(name);
}

/**
 * Get the `reason_blocked` string from the catalog for a not-yet-mapped
 * parameter, or undefined if the parameter isn't in the not-yet-mapped
 * list.
 */
export function notYetMappedReason(name: string): string | undefined {
  const nym = loadNotYetMapped();
  return nym[name]?.reason_blocked;
}

/**
 * Convenience: the full list of "canonical V1.3 parameter" names the
 * CLI should recognize — mapped + not-yet-mapped — so that 'axon get'
 * can distinguish "unknown parameter" from "known-but-unmapped".
 */
export function listAllKnownNames(): string[] {
  const mapped = listParameters().map((p) => p.name);
  const unmapped = Object.keys(loadNotYetMapped());
  return [...mapped, ...unmapped];
}

// ---------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------

/**
 * Look up the "default" value for a parameter from the model's
 * `defaults` map. Returns the user-facing canonical value (e.g. a
 * number of degrees for servo_angle, the string "normal" for
 * inversion), not the raw byte. Returns undefined if there's no
 * default defined in the catalog.
 */
export function getParameterDefault(name: string, modelId: string): unknown | undefined {
  const catalog = loadCatalog();
  const model = findModel(catalog, modelId);
  if (!model) return undefined;
  const raw = model.defaults[name];
  if (raw === undefined) return undefined;
  return canonicalizeDefault(name, raw, modelId);
}

function canonicalizeDefault(
  name: string,
  rawDefault: ModelDefaultValue,
  modelId: string,
): unknown | undefined {
  // Primitives (e.g. "normal" for inversion) pass through.
  if (
    typeof rawDefault === "string" ||
    typeof rawDefault === "number" ||
    typeof rawDefault === "boolean" ||
    rawDefault === null
  ) {
    return rawDefault;
  }
  // Structured form: pick the most useful user-facing field per
  // parameter. We intentionally prefer user-facing fields
  // ("user_step", "us", "percent_approx", "deg_approx") over the raw
  // byte because the user-facing semantics are what parseUserInput
  // produces and validate() checks.
  switch (name) {
    case "servo_angle": {
      // Prefer deg_approx if present; otherwise compute from raw.
      if (typeof rawDefault.deg_approx === "number") return rawDefault.deg_approx;
      if (typeof rawDefault.raw === "number") {
        return Math.round((rawDefault.raw * maxRangeDeg(modelId)) / 255);
      }
      return undefined;
    }
    case "servo_neutral": {
      if (typeof rawDefault.us === "number") return rawDefault.us;
      if (typeof rawDefault.raw === "number") return rawDefault.raw - 128;
      return undefined;
    }
    case "sensitivity": {
      if (typeof rawDefault.user_step === "number") return rawDefault.user_step;
      if (typeof rawDefault.raw === "number") return Math.floor(rawDefault.raw / 16) - 1;
      return undefined;
    }
    case "pwm_power": {
      if (typeof rawDefault.percent_approx === "number") return rawDefault.percent_approx;
      if (typeof rawDefault.raw === "number") {
        return Math.round((rawDefault.raw * 100) / 255);
      }
      return undefined;
    }
    case "loose_pwm_protection":
      // The catalog explicitly records the mode as null here: we can't
      // restore a meaningful default because we don't know the bit
      // mapping yet. Skip.
      return undefined;
    default:
      return undefined;
  }
}

// Re-export the catalog types so callers can use them without a direct
// catalog import when they only touch the parameter layer.
export type { CatalogParameterSpec };

/**
 * Iterate the catalog's raw parameter list (useful when the CLI needs
 * to inspect "all canonical parameters, mapped or not"). Alias of the
 * catalog's export, re-exported here so the parameters module is the
 * single import point for the CLI command layer.
 */
export function listCatalogParameters(): CatalogParameterSpec[] {
  return loadCatalogParameters();
}
