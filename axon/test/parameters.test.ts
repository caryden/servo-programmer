/**
 * Unit tests for `axon/src/parameters.ts` — the per-parameter
 * read/write/parse/validate logic.
 *
 * Every mapped parameter gets a round-trip test: take a known-good
 * fixture, parseUserInput → write → read → assertEqual. This is the
 * fastest way to catch encoding bugs without hardware.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findParameter,
  getParameterDefault,
  isParameterNotYetMapped,
  listParameters,
  notYetMappedReason,
} from "../src/parameters.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures/dual_test7_config.svo");
const FIXTURE = () => Buffer.from(readFileSync(FIXTURE_PATH));
const MODEL_ID = "SA33****";

describe("parameters registry", () => {
  test("listParameters returns the v1.0 core set", () => {
    const names = listParameters().map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "servo_angle",
        "servo_neutral",
        "dampening_factor",
        "sensitivity",
        "inversion",
        "loose_pwm_protection",
        "pwm_power",
        "soft_start",
        "overload_protection",
        "overload_level1",
        "overload_level2",
        "overload_level3",
        "proptl",
      ]),
    );
    expect(names.length).toBe(13);
  });

  test("findParameter returns undefined for unknown names", () => {
    expect(findParameter("nonexistent")).toBeUndefined();
  });

  test("every parameter has required user-facing fields", () => {
    for (const p of listParameters()) {
      expect(p.vendorLabel.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.unit.length).toBeGreaterThan(0);
      expect(p.modes.length).toBeGreaterThan(0);
    }
  });
});

describe("isParameterNotYetMapped", () => {
  test("dampening_factor is NOT in the not-yet-mapped list", () => {
    expect(isParameterNotYetMapped("dampening_factor")).toBe(false);
    expect(notYetMappedReason("dampening_factor")).toBeUndefined();
  });

  test("soft_start is NOT in the not-yet-mapped list", () => {
    expect(isParameterNotYetMapped("soft_start")).toBe(false);
  });

  test("overload_protection is NOT in the not-yet-mapped list", () => {
    expect(isParameterNotYetMapped("overload_protection")).toBe(false);
  });

  test("servo_angle is NOT in the not-yet-mapped list", () => {
    expect(isParameterNotYetMapped("servo_angle")).toBe(false);
  });

  test("notYetMappedReason returns undefined for mapped params", () => {
    expect(notYetMappedReason("servo_angle")).toBeUndefined();
  });
});

describe("servo_angle parameter", () => {
  const spec = findParameter("servo_angle")!;

  test("reads the fixture as raw 130 (byte 0x04 = 0x82)", () => {
    const v = spec.read(FIXTURE(), MODEL_ID);
    expect(v.raw).toBe(0x82); // 130
    expect(v.physical).toBe(130);
    expect(v.unit).toBe("raw");
  });

  test("parseUserInput accepts plain numbers", () => {
    expect(spec.parseUserInput("180", MODEL_ID)).toBe(180);
    expect(spec.parseUserInput(" 130 ", MODEL_ID)).toBe(130);
  });

  test("parseUserInput rejects garbage", () => {
    expect(() => spec.parseUserInput("nope", MODEL_ID)).toThrow();
  });

  test("validate rejects out-of-range values", () => {
    expect(spec.validate(-1, MODEL_ID)).toBeTruthy();
    expect(spec.validate(400, MODEL_ID)).toBeTruthy(); // > 355
    expect(spec.validate(180, MODEL_ID)).toBeNull();
  });

  test("write updates byte 0x04 and mirror 0x05", () => {
    const cfg = FIXTURE();
    const out = spec.write(cfg, 180, MODEL_ID);
    expect(out[0x04]).toBe(180);
    expect(out[0x05]).toBe(180); // mirror
    // Original buffer must be untouched.
    expect(cfg[0x04]).toBe(0x82);
  });

  test("parseUserInput → write → read round-trip", () => {
    const cfg = FIXTURE();
    const parsed = spec.parseUserInput("200", MODEL_ID) as number;
    const next = spec.write(cfg, parsed, MODEL_ID);
    const after = spec.read(next, MODEL_ID);
    expect(after.physical).toBe(200);
  });
});

describe("servo_neutral parameter", () => {
  const spec = findParameter("servo_neutral")!;

  test("reads the fixture as 0 µs (raw 0x80)", () => {
    const v = spec.read(FIXTURE(), MODEL_ID);
    expect(v.raw).toBe(0x80);
    expect(v.physical).toBe(0);
    expect(v.unit).toBe("us");
  });

  test("parseUserInput accepts signed microseconds", () => {
    expect(spec.parseUserInput("20", MODEL_ID)).toBe(20);
    expect(spec.parseUserInput("-20", MODEL_ID)).toBe(-20);
    expect(spec.parseUserInput("20 us", MODEL_ID)).toBe(20);
  });

  test("validate rejects values outside -127..+127", () => {
    expect(spec.validate(128, MODEL_ID)).toBeTruthy();
    expect(spec.validate(-128, MODEL_ID)).toBeTruthy();
    expect(spec.validate(0, MODEL_ID)).toBeNull();
    expect(spec.validate(127, MODEL_ID)).toBeNull();
  });

  test("write round-trip: -20 µs → read → -20", () => {
    const cfg = FIXTURE();
    const next = spec.write(cfg, -20, MODEL_ID);
    expect(next[0x06]).toBe(108); // 128 - 20
    const after = spec.read(next, MODEL_ID);
    expect(after.physical).toBe(-20);
  });
});

describe("sensitivity parameter", () => {
  const spec = findParameter("sensitivity")!;

  test("reads the fixture as step 0 (raw 0x10)", () => {
    const v = spec.read(FIXTURE(), MODEL_ID);
    expect(v.raw).toBe(0x10);
    expect(v.physical).toBe(0);
    expect(v.unit).toBe("step");
  });

  test("validate rejects steps outside 0..14", () => {
    expect(spec.validate(-1, MODEL_ID)).toBeTruthy();
    expect(spec.validate(15, MODEL_ID)).toBeTruthy();
    expect(spec.validate(4, MODEL_ID)).toBeNull();
  });

  test("parseUserInput rejects non-integers", () => {
    expect(() => spec.parseUserInput("1.5", MODEL_ID)).toThrow();
  });

  test("write round-trip: step 7 → raw 0x80 → read back 7", () => {
    const cfg = FIXTURE();
    const next = spec.write(cfg, 7, MODEL_ID);
    expect(next[0x0c]).toBe(0x80); // (7+1) * 16 = 128
    const after = spec.read(next, MODEL_ID);
    expect(after.physical).toBe(7);
  });
});

describe("inversion parameter", () => {
  const spec = findParameter("inversion")!;

  test("reads the fixture — bit 0x02 of 0x25 (fixture=0xE3) is set → 'reversed'", () => {
    const v = spec.read(FIXTURE(), MODEL_ID);
    expect(v.physical).toBe("reversed");
  });

  test("parseUserInput accepts both enum values", () => {
    expect(spec.parseUserInput("normal", MODEL_ID)).toBe("normal");
    expect(spec.parseUserInput("REVERSED", MODEL_ID)).toBe("reversed");
  });

  test("parseUserInput rejects unknown enum values", () => {
    expect(() => spec.parseUserInput("flipped", MODEL_ID)).toThrow();
  });

  test("write clears and sets bit 0x02 without touching other bits", () => {
    const cfg = FIXTURE();
    const beforeOther = cfg[0x25]! & ~0x02;
    const normal = spec.write(cfg, "normal", MODEL_ID);
    expect(normal[0x25]! & 0x02).toBe(0);
    expect(normal[0x25]! & ~0x02).toBe(beforeOther);
    const reversed = spec.write(normal, "reversed", MODEL_ID);
    expect(reversed[0x25]! & 0x02).toBe(0x02);
    expect(reversed[0x25]! & ~0x02).toBe(beforeOther);
  });
});

describe("loose_pwm_protection parameter", () => {
  const spec = findParameter("loose_pwm_protection")!;

  test("read returns the enum mode from the fixture (neutral)", () => {
    const v = spec.read(FIXTURE(), MODEL_ID);
    // Fixture byte 0x25 = 0xE3, bits 0x60 = 0x60 → neutral
    expect(v.physical).toBe("neutral");
    expect(v.unit).toBe("enum");
  });

  test("parseUserInput accepts all three enum values", () => {
    expect(spec.parseUserInput("release", MODEL_ID)).toBe("release");
    expect(spec.parseUserInput("hold", MODEL_ID)).toBe("hold");
    expect(spec.parseUserInput("neutral", MODEL_ID)).toBe("neutral");
  });

  test("write sets correct bits for each mode", () => {
    const cfg = FIXTURE();
    const release = spec.write(cfg, "release", MODEL_ID);
    expect(release[0x25]! & 0x60).toBe(0x00);
    const hold = spec.write(cfg, "hold", MODEL_ID);
    expect(hold[0x25]! & 0x60).toBe(0x40);
    const neutral = spec.write(cfg, "neutral", MODEL_ID);
    expect(neutral[0x25]! & 0x60).toBe(0x60);
  });
});

describe("pwm_power parameter", () => {
  const spec = findParameter("pwm_power")!;

  test("reads the fixture as ~86% (raw 0xDC)", () => {
    const v = spec.read(FIXTURE(), MODEL_ID);
    expect(v.raw).toBe(0xdc);
    expect(v.physical).toBe(86);
    expect(v.unit).toBe("percent");
  });

  test("validate rejects values outside 0..100", () => {
    expect(spec.validate(101, MODEL_ID)).toBeTruthy();
    expect(spec.validate(-1, MODEL_ID)).toBeTruthy();
    expect(spec.validate(75, MODEL_ID)).toBeNull();
  });

  test("parseUserInput accepts plain numbers and percent suffix", () => {
    expect(spec.parseUserInput("75", MODEL_ID)).toBe(75);
    expect(spec.parseUserInput("75%", MODEL_ID)).toBe(75);
  });

  test("write updates primary + three mirrors and enforces 0x0F = primary-20", () => {
    const cfg = FIXTURE();
    const next = spec.write(cfg, 75, MODEL_ID);
    const primary = Math.round((75 * 255) / 100); // 191
    expect(next[0x11]).toBe(primary);
    expect(next[0x12]).toBe(primary);
    expect(next[0x13]).toBe(primary);
    expect(next[0x0f]).toBe(primary - 20);
  });

  test("write clamps 0x0F at 0 when primary < 20", () => {
    const cfg = FIXTURE();
    const next = spec.write(cfg, 5, MODEL_ID);
    expect(next[0x0f]).toBe(0);
  });
});

describe("getParameterDefault", () => {
  test("returns ~111° for servo_angle on the Mini", () => {
    const def = getParameterDefault("servo_angle", MODEL_ID);
    expect(def).toBe(111);
  });

  test("returns 0 µs for servo_neutral", () => {
    expect(getParameterDefault("servo_neutral", MODEL_ID)).toBe(0);
  });

  test("returns step 4 for sensitivity", () => {
    expect(getParameterDefault("sensitivity", MODEL_ID)).toBe(4);
  });

  test("returns 'normal' for inversion", () => {
    expect(getParameterDefault("inversion", MODEL_ID)).toBe("normal");
  });

  test("returns ~86 for pwm_power", () => {
    expect(getParameterDefault("pwm_power", MODEL_ID)).toBe(86);
  });

  test("returns undefined for loose_pwm_protection (unresolved mapping)", () => {
    expect(getParameterDefault("loose_pwm_protection", MODEL_ID)).toBeUndefined();
  });
});
