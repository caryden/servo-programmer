import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ExitCode } from "../../src/errors.ts";
import { type CapturedIO, captureIO } from "../helpers/capture-io.ts";
import { MockDongle } from "../mocks/mock-dongle.ts";

describe("axon mode security checks", () => {
  let io: CapturedIO;

  beforeEach(() => {
    io = captureIO();
  });

  afterEach(() => {
    io.restore();
    mock.restore();
  });

  test("mode current ignores bundled_firmware entries inherited from the prototype", async () => {
    const protoFirmware = {
      standard: {
        file: "proto-standard.sfw",
        sha256: "proto-sha256",
        description: "prototype-only firmware entry",
      },
    };
    const bundledFirmware = Object.create(protoFirmware) as Record<string, unknown>;
    const model = {
      id: "SA33****",
      name: "Axon Mini",
      max_range_deg: null,
      pulse_range_us: [0, 0] as [number, number],
      defaults: {},
      bundled_firmware: bundledFirmware,
    };
    const catalog = {
      version: "test",
      source_docs: "test",
      models: new Map([[model.id, model]]),
      parameters: {},
    };

    await mock.module("../../src/driver/hid.ts", () => ({
      listDongles: () => [],
      isDonglePresent: () => false,
      openDongle: async () => {
        throw new Error("openDongle should not be called in this test");
      },
      VID: 0x0471,
      PID: 0x13aa,
      REPORT_SIZE: 64,
    }));
    await mock.module("../../src/catalog.ts", () => ({
      loadCatalog: () => catalog,
      findModel: (loadedCatalog: typeof catalog, modelId: string) =>
        loadedCatalog.models.get(modelId),
      findServoMode: (idByte: number) =>
        idByte === 0x03
          ? {
              id: "servo_mode",
              id_byte: 0x03,
              name: "Servo Mode",
              description: "test",
              available_parameters: [],
            }
          : null,
      loadServoModes: () => [],
      parseModelId: (bytes: Uint8Array) =>
        Array.from(bytes)
          .map((b) => String.fromCharCode(b))
          .join("")
          .replace(/\0+$/g, ""),
    }));

    const { runModeWithHandle } = await import("../../src/commands/mode.ts");
    const code = await runModeWithHandle(
      new MockDongle(),
      { json: true, quiet: false, yes: true },
      { subcommand: "current" },
    );

    expect(code).toBe(ExitCode.Ok);
    expect(Object.hasOwn(bundledFirmware, "standard")).toBe(false);
    expect("standard" in bundledFirmware).toBe(true);
    const result = JSON.parse(io.stdout);
    expect(result.mode.catalog_key).toBeNull();
    expect(result.mode.id).toBe("servo_mode");
  });
});
