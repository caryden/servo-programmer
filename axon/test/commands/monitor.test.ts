import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { AxonError } from "../../src/errors.ts";
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

function installImmediateSigintTimeout(): void {
  let calls = 0;
  spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: TimerHandler,
    _ms?: number,
    ...args: unknown[]
  ) => {
    calls += 1;
    if (calls === 1) {
      process.emit("SIGINT");
    }
    (callback as (...cbArgs: unknown[]) => void)(...args);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
}

describe("axon monitor", () => {
  let io: CapturedIO;

  beforeEach(() => {
    io = captureIO();
  });

  afterEach(() => {
    io.restore();
    mock.restore();
  });

  test("reports no_adapter and removes the SIGINT handler on exit", async () => {
    const baseline = process.listenerCount("SIGINT");
    installImmediateSigintTimeout();

    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [],
      openDongle: async () => {
        throw new Error("openDongle should not run when nothing is visible");
      },
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runMonitor } = await import("../../src/commands/monitor.ts");

    const code = await runMonitor(JSON_FLAGS);

    expect(code).toBe(0);
    expect(JSON.parse(io.stdout.trim())).toEqual({
      adapter: "disconnected",
      servo: null,
      mode: null,
    });
    expect(process.listenerCount("SIGINT")).toBe(baseline);
  });

  test("reports adapter_busy when the HID claim fails", async () => {
    const baseline = process.listenerCount("SIGINT");
    installImmediateSigintTimeout();

    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
      openDongle: async () => {
        throw AxonError.adapterBusy("device or resource busy");
      },
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runMonitor } = await import("../../src/commands/monitor.ts");

    const code = await runMonitor(JSON_FLAGS);

    expect(code).toBe(0);
    expect(JSON.parse(io.stdout.trim())).toEqual({
      adapter: "busy",
      servo: null,
      mode: null,
    });
    expect(process.listenerCount("SIGINT")).toBe(baseline);
  });

  test("reports no_servo when identify returns the cold state", async () => {
    const baseline = process.listenerCount("SIGINT");
    installImmediateSigintTimeout();

    const mockDongle = new MockDongle();
    mockDongle.state = "cold";

    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runMonitor } = await import("../../src/commands/monitor.ts");

    const code = await runMonitor(JSON_FLAGS);

    expect(code).toBe(0);
    expect(JSON.parse(io.stdout.trim())).toEqual({
      adapter: "connected",
      servo: null,
      mode: null,
    });
    expect(process.listenerCount("SIGINT")).toBe(baseline);
  });

  test("human output shows the connected servo and mode", async () => {
    const baseline = process.listenerCount("SIGINT");
    installImmediateSigintTimeout();

    const mockDongle = new MockDongle();
    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [DONGLE],
      openDongle: async () => mockDongle,
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    const { runMonitor } = await import("../../src/commands/monitor.ts");

    const code = await runMonitor(HUMAN_FLAGS);

    expect(code).toBe(0);
    expect(io.stdout).toContain("[Adapter]");
    expect(io.stdout).toContain("[Axon Mini]");
    expect(io.stdout).toContain("[Servo Mode]");
    expect(process.listenerCount("SIGINT")).toBe(baseline);
  });
});
