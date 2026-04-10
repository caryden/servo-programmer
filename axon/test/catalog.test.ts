/**
 * Unit tests for `axon/src/catalog.ts`. The catalog is loaded from
 * the bundled `data/servo_catalog.json` via Bun's JSON import, so
 * these tests exercise the real embedded payload — if the JSON file
 * drifts in a way that drops the Axon Mini entry or breaks the
 * placeholder-filtering contract, these tests will catch it.
 */

import { describe, expect, test } from "bun:test";
import { findModel, loadCatalog, parseModelId } from "../src/catalog.ts";

describe("catalog", () => {
  test("loadCatalog returns the embedded JSON", () => {
    const catalog = loadCatalog();
    expect(catalog.version).toBeDefined();
    expect(catalog.version.length).toBeGreaterThan(0);
    expect(catalog.models).toBeInstanceOf(Map);
    expect(catalog.models.size).toBeGreaterThan(0);
  });

  test("loadCatalog filters out _placeholder model entries", () => {
    const catalog = loadCatalog();
    // Any key starting with "_" in servo_catalog.json (e.g.
    // "_Axon_Max_placeholder") must be filtered out by loadCatalog.
    for (const key of catalog.models.keys()) {
      expect(key.startsWith("_")).toBe(false);
    }
  });

  test("parseModelId strips trailing nulls", () => {
    const bytes = new Uint8Array([0x53, 0x41, 0x33, 0x33, 0x00, 0x00, 0x00, 0x00]);
    expect(parseModelId(bytes)).toBe("SA33");
  });

  test("parseModelId preserves '*' padding", () => {
    // The SA33**** form is the real Mini's id — '*' bytes are NOT
    // trailing nulls, they're the vendor's padding char, and must
    // survive the parse.
    const bytes = new Uint8Array([0x53, 0x41, 0x33, 0x33, 0x2a, 0x2a, 0x2a, 0x2a]);
    expect(parseModelId(bytes)).toBe("SA33****");
  });

  test("parseModelId throws on wrong-length input", () => {
    expect(() => parseModelId(new Uint8Array(7))).toThrow(/8 bytes/);
    expect(() => parseModelId(new Uint8Array(9))).toThrow(/8 bytes/);
  });

  test("findModel('SA33****') returns Axon Mini", () => {
    const catalog = loadCatalog();
    const model = findModel(catalog, "SA33****");
    expect(model).toBeDefined();
    expect(model?.name).toBe("Axon Mini");
    expect(model?.pulse_range_us).toEqual([500, 2500]);
  });

  test("findModel('UNKNOWN') returns undefined", () => {
    const catalog = loadCatalog();
    expect(findModel(catalog, "UNKNOWN")).toBeUndefined();
  });
});
