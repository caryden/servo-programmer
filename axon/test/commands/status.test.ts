/**
 * Tests for `axon status`. The command talks to node-hid via
 * `isDonglePresent` and `openDongle`, which we `mock.module` to
 * exercise the phase state machine without a physical adapter.
 *
 * Covers the three "sad" phases explicitly because they were all
 * touched during the adapter_stale → adapter_io rename and the
 * dongle → adapter user-facing-text sweep:
 *
 *   - no_adapter:  isDonglePresent() returns false
 *   - adapter_busy: openDongle() throws AxonError.adapterBusy
 *   - adapter_io:  identify() throws AxonError.adapterIo
 *
 * Plus one happy-path test that drives a MockDongle through the
 * full pipeline and asserts the "servo_present" category.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ExitCode } from "../../src/errors.ts";
import { MockDongle } from "../mocks/mock-dongle.ts";

interface CapturedIO {
  stdout: string;
  stderr: string;
  restore: () => void;
}

function captureIO(): CapturedIO {
  const chunks = { stdout: [] as Uint8Array[], stderr: [] as Uint8Array[] };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // @ts-expect-error override
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    chunks.stdout.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    return true;
  };
  // @ts-expect-error override
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    chunks.stderr.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    return true;
  };
  return {
    get stdout() {
      return Buffer.concat(chunks.stdout).toString("utf8");
    },
    get stderr() {
      return Buffer.concat(chunks.stderr).toString("utf8");
    },
    restore() {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

const JSON_FLAGS = { json: true, quiet: false, yes: true };

describe("axon status", () => {
  let io: CapturedIO;
  beforeEach(() => {
    io = captureIO();
  });
  afterEach(() => {
    io.restore();
    mock.restore();
  });

  test("no_adapter phase: category + hint are observation-only", async () => {
    await mock.module("../../src/driver/hid.ts", () => ({
      isDonglePresent: () => false,
      openDongle: async () => {
        throw new Error("should not be called when isDonglePresent is false");
      },
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runStatus } = await import("../../src/commands/status.ts");
    const code = await runStatus(JSON_FLAGS);
    expect(code).toBe(ExitCode.Ok);
    const result = JSON.parse(io.stdout.trim());
    expect(result.category).toBe("no_adapter");
    expect(result.adapter).toBe("disconnected");
    // Hint must not name a vendor tool, VM, OS detail, or analyzer.
    expect(result.hint).toBeDefined();
    expect(result.hint).not.toMatch(/parallels|saleae|iokit|macos|vendor exe/i);
    // Hint must still name the concrete action.
    expect(result.hint).toMatch(/plug in/i);
    expect(result.hint).toMatch(/adapter/i);
  });

  test("adapter_busy phase: openDongle throw is surfaced verbatim", async () => {
    await mock.module("../../src/driver/hid.ts", () => {
      // Import inside the factory so we get a fresh AxonError that
      // hasn't been frozen by the previous test.
      const { AxonError } = require("../../src/errors.ts");
      return {
        isDonglePresent: () => true,
        openDongle: async () => {
          throw AxonError.adapterBusy("device or resource busy (errno=EACCES)");
        },
        VID: 0x0471,
        PID: 0x13aa,
        REPORT_SIZE: 64,
      };
    });
    const { runStatus } = await import("../../src/commands/status.ts");
    const code = await runStatus(JSON_FLAGS);
    expect(code).toBe(ExitCode.Ok);
    const result = JSON.parse(io.stdout.trim());
    expect(result.category).toBe("adapter_busy");
    expect(result.error).toContain("device or resource busy");
    expect(result.error).toContain("EACCES");
    // Hint stays observation-only.
    expect(result.hint).not.toMatch(/parallels|saleae|iokit|vendor exe/i);
  });

  test("adapter_io phase: identify failure on open handle maps to adapter_io", async () => {
    // This mock returns a real MockDongle on openDongle, but then
    // identify() is a wire-level no-op that throws an AxonError.adapterIo
    // to simulate a HID I/O failure after the handle opened.
    const mockDongle = new MockDongle();
    // Patch the mock to throw on the next write — that's how the
    // protocol layer will surface the I/O failure through identify.
    const origWrite = mockDongle.write.bind(mockDongle);
    let writeCount = 0;
    mockDongle.write = async (data: Buffer, timeoutMs?: number) => {
      writeCount++;
      if (writeCount === 1) {
        const { AxonError } = await import("../../src/errors.ts");
        throw AxonError.adapterIo("HID write returned -1 (mock test)");
      }
      return origWrite(data, timeoutMs);
    };

    await mock.module("../../src/driver/hid.ts", () => ({
      isDonglePresent: () => true,
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runStatus } = await import("../../src/commands/status.ts");
    const code = await runStatus(JSON_FLAGS);
    expect(code).toBe(ExitCode.Ok);
    const result = JSON.parse(io.stdout.trim());
    expect(result.category).toBe("adapter_io");
    expect(result.error).toContain("HID I/O to the Axon adapter failed");
    expect(result.error).toContain("HID write returned -1");
    expect(result.hint).not.toMatch(/parallels|saleae|iokit|vendor exe/i);
  });

  test("servo_present phase: full pipeline succeeds on MockDongle", async () => {
    const mockDongle = new MockDongle();
    await mock.module("../../src/driver/hid.ts", () => ({
      isDonglePresent: () => true,
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runStatus } = await import("../../src/commands/status.ts");
    const code = await runStatus(JSON_FLAGS);
    expect(code).toBe(ExitCode.Ok);
    const result = JSON.parse(io.stdout.trim());
    expect(result.category).toBe("servo_present");
    expect(result.adapter).toBe("connected");
    expect(result.servo).toBe("present");
    expect(result.model?.known).toBe(true);
    // Mini fixture's model id byte string.
    expect(result.model?.id).toBe("SA33****");
  });
});
