import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { AxonError, ExitCode } from "../../src/errors.ts";
import { type CapturedIO, captureIO } from "../helpers/capture-io.ts";
import { MockDongle } from "../mocks/mock-dongle.ts";

const JSON_FLAGS = { json: true, quiet: false, yes: true };
const HUMAN_FLAGS = { json: false, quiet: false, yes: true };
const DONGLE = {
  vendorId: 0x0471,
  productId: 0x13aa,
  path: "mock-path",
  product: "USBBootloader V1.3",
  manufacturer: "Stone Laboratories inc.",
  release: 1,
  interface: 0,
};

describe("axon doctor", () => {
  let io: CapturedIO;

  beforeEach(() => {
    io = captureIO();
  });

  afterEach(() => {
    io.restore();
    mock.restore();
  });

  test("reports no_adapter with a VM-aware hint", async () => {
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [],
      openDongle: async () => {
        throw new Error("openDongle should not run without a visible adapter");
      },
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));

    const { runDoctor } = await import("../../src/commands/doctor.ts");
    const code = await runDoctor(JSON_FLAGS);

    expect(code).toBe(ExitCode.Ok);
    const result = JSON.parse(io.stdout);
    expect(result.ok).toBe(false);
    expect(result.category).toBe("no_adapter");
    expect(result.adapter.count).toBe(0);
    expect(result.checks.map((check: { id: string }) => check.id)).toEqual([
      "runtime",
      "catalog",
      "usb_hid",
    ]);
    expect(result.checks.at(-1).hint).toMatch(/parallels|windows|vm/i);
  });

  test("classifies adapter_busy when the HID interface is owned elsewhere", async () => {
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
      openDongle: async () => {
        throw AxonError.adapterBusy("device or resource busy (mock)");
      },
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));

    const { runDoctor } = await import("../../src/commands/doctor.ts");
    const code = await runDoctor(JSON_FLAGS);

    expect(code).toBe(ExitCode.Ok);
    const result = JSON.parse(io.stdout);
    expect(result.category).toBe("adapter_busy");
    expect(result.adapter.count).toBe(1);
    expect(result.adapter.openable).toBe(false);
    expect(result.adapter.devices[0].product).toBe("USBBootloader V1.3");
    expect(result.checks.at(-1).id).toBe("hid_open");
    expect(result.checks.at(-1).hint).toMatch(/parallels|windows|vm|app/i);
  });

  test("stops after identify when the adapter reports no servo", async () => {
    const mockDongle = new MockDongle();
    mockDongle.state = "cold";
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));

    const { runDoctor } = await import("../../src/commands/doctor.ts");
    const code = await runDoctor(JSON_FLAGS, { debug: true });

    expect(code).toBe(ExitCode.Ok);
    const result = JSON.parse(io.stdout);
    expect(result.category).toBe("no_servo");
    expect(result.servo.present).toBe(false);
    expect(result.checks.map((check: { id: string }) => check.id)).not.toContain("config_read");
    expect(result.debug.identify_rx).toMatch(/^04 01 fa/);
    expect(result.debug.first_config_rx).toBeUndefined();
  });

  test("happy path returns all checks plus debug reply prefixes", async () => {
    const mockDongle = new MockDongle();
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));

    const { runDoctor } = await import("../../src/commands/doctor.ts");
    const code = await runDoctor(JSON_FLAGS, { debug: true });

    expect(code).toBe(ExitCode.Ok);
    const result = JSON.parse(io.stdout);
    expect(result.ok).toBe(true);
    expect(result.category).toBe("ok");
    expect(result.checks.map((check: { id: string }) => check.id)).toEqual([
      "runtime",
      "catalog",
      "usb_hid",
      "hid_open",
      "identify",
      "config_read",
    ]);
    expect(result.servo.model.id).toBe("SA33****");
    expect(result.servo.model.known).toBe(true);
    expect(result.debug.identify_rx).toMatch(/^04 01 00/);
    expect(result.debug.first_config_rx).toMatch(/^04 01 00/);
    expect(result.debug.config_prefix).toContain("3b d0 0b f6");
  });

  test("human output is a concise check report", async () => {
    const mockDongle = new MockDongle();
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));

    const { runDoctor } = await import("../../src/commands/doctor.ts");
    const code = await runDoctor(HUMAN_FLAGS);

    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("Axon doctor");
    expect(io.stdout).toContain("✓ USB/HID visibility");
    expect(io.stdout).toContain("✓ Config read");
    expect(io.stderr).toBe("");
  });
});
