import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ExitCode } from "../../src/errors.ts";
import { type CapturedIO, captureIO } from "../helpers/capture-io.ts";
import { MockDongle } from "../mocks/mock-dongle.ts";

const GLOBAL_FLAGS = { json: false, quiet: false, yes: true };
const JSON_FLAGS = { json: true, quiet: false, yes: true };

describe("axon read", () => {
  let io: CapturedIO;

  beforeEach(() => {
    io = captureIO();
  });

  afterEach(() => {
    io.restore();
    mock.restore();
  });

  test("human output reports the servo model and releases the handle", async () => {
    const mockDongle = new MockDongle();
    let released = false;
    const originalRelease = mockDongle.release.bind(mockDongle);
    mockDongle.release = async () => {
      released = true;
      return originalRelease();
    };

    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [],
      isDonglePresent: () => false,
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runRead } = await import("../../src/commands/read.ts");

    const code = await runRead(GLOBAL_FLAGS, { format: "human" });

    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("model      SA33****");
    expect(io.stdout).toContain("Axon Mini");
    expect(io.stdout).toContain("block      95 bytes");
    expect(released).toBe(true);
  });

  test("json output serializes the model metadata", async () => {
    const mockDongle = new MockDongle();
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [],
      isDonglePresent: () => false,
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runRead } = await import("../../src/commands/read.ts");

    const code = await runRead(JSON_FLAGS, { format: "json" });

    expect(code).toBe(ExitCode.Ok);
    const parsed = JSON.parse(io.stdout);
    expect(parsed.model.id).toBe("SA33****");
    expect(parsed.model.name).toBe("Axon Mini");
    expect(parsed.model.known).toBe(true);
    expect(parsed.byte_count).toBe(95);
  });

  test("svo output emits the raw 95-byte block", async () => {
    const mockDongle = new MockDongle();
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [],
      isDonglePresent: () => false,
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runRead } = await import("../../src/commands/read.ts");

    const code = await runRead(GLOBAL_FLAGS, { format: "svo" });

    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout.length).toBeGreaterThan(0);
    expect(io.stdout).toContain("SA33");
  });

  test("hex output prints the annotated dump", async () => {
    const mockDongle = new MockDongle();
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [],
      isDonglePresent: () => false,
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runRead } = await import("../../src/commands/read.ts");

    const code = await runRead(GLOBAL_FLAGS, { format: "hex" });

    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("0x00");
    expect(io.stdout).toContain("SA33");
  });
});
