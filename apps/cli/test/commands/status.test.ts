/**
 * Tests for `axon status`. The command talks to node-hid via
 * `listDongles` and `openDongle`, which we `mock.module` to
 * exercise the phase state machine without a physical adapter.
 *
 * Covers the three "sad" phases explicitly because they were all
 * touched during the adapter_stale → adapter_io rename and the
 * dongle → adapter user-facing-text sweep:
 *
 *   - no_adapter:  listDongles() returns []
 *   - adapter_busy: openDongle() throws AxonError.adapterBusy
 *   - adapter_io:  identify() throws AxonError.adapterIo
 *
 * Plus one happy-path test that drives a MockDongle through the
 * full pipeline and asserts the "servo_present" category.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { AxonError, ExitCode } from "../../src/errors.ts";
import { type CapturedIO, captureIO } from "../helpers/capture-io.ts";
import { MockDongle } from "../mocks/mock-dongle.ts";

const JSON_FLAGS = { json: true, quiet: false, yes: true };
const DONGLE = {
  vendorId: 0x0471,
  productId: 0x13aa,
  path: "mock-path",
  product: "USBBootloader V1.3",
  manufacturer: "Stone Laboratories inc.",
  release: 1,
  interface: 0,
};

describe("axon status", () => {
  let io: CapturedIO;
  beforeEach(() => {
    io = captureIO();
  });
  afterEach(() => {
    io.restore();
    mock.restore();
  });

  test("no_adapter phase: category + VM-aware hint", async () => {
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [],
      isDonglePresent: () => false,
      openDongle: async () => {
        throw new Error("should not be called when listDongles returns no adapters");
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
    expect(result.hint).toBeDefined();
    expect(result.hint).toMatch(/plug in/i);
    expect(result.hint).toMatch(/adapter/i);
    expect(result.hint).toMatch(/parallels|vm|windows/i);
  });

  test("adapter_busy phase: openDongle throw is surfaced verbatim", async () => {
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
      isDonglePresent: () => true,
      openDongle: async () => {
        throw AxonError.adapterBusy("device or resource busy (errno=EACCES)");
      },
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runStatus } = await import("../../src/commands/status.ts");
    const code = await runStatus(JSON_FLAGS);
    expect(code).toBe(ExitCode.Ok);
    const result = JSON.parse(io.stdout.trim());
    expect(result.category).toBe("adapter_busy");
    expect(result.adapter).toBe("busy");
    expect(result.error).toContain("device or resource busy");
    expect(result.error).toContain("EACCES");
    expect(result.hint).toMatch(/app|vm|parallels|windows/i);
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
      listDongles: () => [DONGLE],
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

  test("servo_io phase: config read failure after identify maps to servo_io", async () => {
    // Identify succeeds, but the subsequent readFullConfig throws.
    // The old code labeled this servo_present (wrong — scripts
    // branching on the category would see success). Fixed: it now
    // emits servo_io with the raw error, so machine consumers can
    // distinguish a connected-and-working servo from one that
    // failed mid-transaction.
    const mockDongle = new MockDongle();
    const origWrite = mockDongle.write.bind(mockDongle);
    const origRead = mockDongle.read.bind(mockDongle);
    let writeCount = 0;
    mockDongle.write = async (data: Buffer, timeoutMs?: number) => {
      writeCount++;
      // Let the identify (write #1) through; fail on the first
      // config read (write #2 onward) with a transport-layer error.
      if (writeCount >= 2) {
        const { AxonError } = await import("../../src/errors.ts");
        throw AxonError.adapterIo("HID write -1 during config read (mock test)");
      }
      return origWrite(data, timeoutMs);
    };
    mockDongle.read = async (timeoutMs?: number) => origRead(timeoutMs);

    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
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
    expect(result.category).toBe("servo_io");
    expect(result.adapter).toBe("connected");
    expect(result.servo).toBe("present");
    expect(result.error).toContain("HID I/O to the Axon adapter failed");
    expect(result.error).toContain("during config read");
  });

  test("servo_present phase: full pipeline succeeds on MockDongle", async () => {
    const mockDongle = new MockDongle();
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
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

  test("servo_present phase tolerates a new identify mode byte", async () => {
    const mockDongle = new MockDongle();
    const origRead = mockDongle.read.bind(mockDongle);
    let readCount = 0;
    mockDongle.read = async (timeoutMs?: number) => {
      const rx = await origRead(timeoutMs);
      readCount++;
      if (readCount === 1) rx[5] = 0x09;
      return rx;
    };

    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
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
    expect(result.mode_byte).toBe("0x09");
    expect(result.mode_label).toBeUndefined();
    expect(result.model?.id).toBe("SA33****");
  });
});
