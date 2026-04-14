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

    const code = await runRead(GLOBAL_FLAGS, { format: "human", debug: false });

    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("model      SA33****");
    expect(io.stdout).toContain("Axon Mini");
    expect(io.stdout).toContain("servo_angle");
    expect(io.stdout).toContain("servo_neutral");
    expect(io.stdout).toContain("pwm_power");
    expect(io.stdout).not.toContain("block      95 bytes");
    expect(released).toBe(true);
  });

  test("json output serializes decoded parameters", async () => {
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

    const code = await runRead(JSON_FLAGS, { format: "json", debug: false });

    expect(code).toBe(ExitCode.Ok);
    const parsed = JSON.parse(io.stdout);
    expect(parsed.model.id).toBe("SA33****");
    expect(parsed.model.name).toBe("Axon Mini");
    expect(parsed.model.known).toBe(true);
    expect(parsed.mode).toBe("servo_mode");
    expect(parsed.parameters.servo_angle.value).toBe(130);
    expect(parsed.parameters.servo_neutral.value).toBe(0);
    expect(parsed.parameters.pwm_power.value).toBe(86);
    expect(parsed.parameters.sensitivity.value).toBe(0);
    expect(parsed.raw_bytes_hex).toBeUndefined();
    expect(parsed.byte_count).toBeUndefined();
  });

  test("debug json includes raw block metadata", async () => {
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

    const code = await runRead(JSON_FLAGS, { format: "json", debug: true });

    expect(code).toBe(ExitCode.Ok);
    const parsed = JSON.parse(io.stdout);
    expect(parsed.raw_bytes_hex).toBeString();
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

    const code = await runRead(GLOBAL_FLAGS, { format: "svo", debug: false });

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

    const code = await runRead(GLOBAL_FLAGS, { format: "hex", debug: false });

    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("0x00");
    expect(io.stdout).toContain("SA33");
  });
});
