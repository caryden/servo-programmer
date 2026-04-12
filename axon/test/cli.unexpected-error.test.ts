import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type CapturedIO, captureIO } from "./helpers/capture-io.ts";

describe("axon CLI unexpected-error handling", () => {
  let io: CapturedIO;
  let previousDebug: string | undefined;

  beforeEach(() => {
    io = captureIO();
    previousDebug = process.env.AXON_DEBUG;
  });

  afterEach(() => {
    io.restore();
    if (previousDebug === undefined) {
      delete process.env.AXON_DEBUG;
    } else {
      process.env.AXON_DEBUG = previousDebug;
    }
  });

  test("hides stack traces by default", async () => {
    delete process.env.AXON_DEBUG;
    const { emitUnexpectedError } = await import("../src/cli.ts");
    emitUnexpectedError(new Error("boom"));

    expect(io.stderr).toContain("unexpected error: boom");
    expect(io.stderr).not.toContain("Error: boom");
    expect(io.stderr).not.toContain("\n    at ");
  });

  test("prints stack traces when AXON_DEBUG=1", async () => {
    process.env.AXON_DEBUG = "1";
    const { emitUnexpectedError } = await import("../src/cli.ts");
    emitUnexpectedError(new Error("boom"));

    expect(io.stderr).toContain("unexpected error: boom");
    expect(io.stderr).toContain("Error: boom");
    expect(io.stderr).toContain("\n    at ");
  });
});
