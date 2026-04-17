import { describe, expect, test } from "bun:test";
import { main, parseArgs } from "../src/cli.ts";
import { ExitCode } from "../src/errors.ts";
import { captureIO } from "./helpers/capture-io.ts";

describe("parseArgs", () => {
  test("keeps negative numeric values as positional arguments", () => {
    const parsed = parseArgs(["set", "servo_neutral", "-20", "--yes"]);

    expect(parsed.command).toBe("set");
    expect(parsed.positional).toEqual(["servo_neutral", "-20"]);
    expect(parsed.global.yes).toBe(true);
    expect(parsed.flags["20"]).toBeUndefined();
  });

  test("keeps negative decimal values as positional arguments", () => {
    const parsed = parseArgs(["set", "servo_neutral", "-.5"]);

    expect(parsed.command).toBe("set");
    expect(parsed.positional).toEqual(["servo_neutral", "-.5"]);
  });
});

describe("main error envelope", () => {
  test("--json AxonError output includes category", async () => {
    const cap = captureIO();
    let code: number;
    try {
      code = await main(["--json", "write"]);
    } finally {
      cap.restore();
    }

    expect(code).toBe(ExitCode.UsageError);
    const error = JSON.parse(cap.stderr);
    expect(error.code).toBe(ExitCode.UsageError);
    expect(error.category).toBe("usage");
    expect(error.error).toContain("--from");
  });
});
