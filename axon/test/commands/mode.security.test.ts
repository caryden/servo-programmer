import { describe, expect, test } from "bun:test";
import { matchingCatalogModeKey } from "../../src/commands/mode.ts";

describe("axon mode security checks", () => {
  test("matchingCatalogModeKey ignores bundled_firmware entries inherited from the prototype", () => {
    const protoFirmware = {
      standard: {
        file: "proto-standard.sfw",
        sha256: "proto-sha256",
        description: "prototype-only firmware entry",
      },
    };
    const bundledFirmware = Object.create(protoFirmware) as Record<string, unknown>;

    expect(Object.hasOwn(bundledFirmware, "standard")).toBe(false);
    expect("standard" in bundledFirmware).toBe(true);
    expect(
      matchingCatalogModeKey(
        {
          bundled_firmware: bundledFirmware,
        },
        "servo_mode",
      ),
    ).toBeNull();
  });
});
