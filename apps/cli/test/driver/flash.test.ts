import { describe, expect, test } from "bun:test";
import {
  flashFirmware,
  MAX_HEX_RECORD_DATA_BYTES,
  validateFlashFirmware,
} from "../../src/driver/flash.ts";
import type { DongleHandle } from "../../src/driver/transport.ts";
import type { DecryptedSfw, IntelHexRecord } from "../../src/sfw.ts";

class RecordingDongle implements DongleHandle {
  public writes = 0;

  async write(_data: Buffer, _timeoutMs?: number): Promise<void> {
    this.writes += 1;
  }

  async read(_timeoutMs?: number): Promise<Buffer> {
    throw new Error("read should not be reached");
  }

  async release(): Promise<void> {}
}

function hexRecord(count: number, type = 0x00): IntelHexRecord {
  return {
    count,
    address: 0,
    type,
    data: Buffer.alloc(count),
    checksum: 0,
    raw: "",
  };
}

function firmwareWith(records: IntelHexRecord[]): DecryptedSfw {
  return {
    declaredLength: 1,
    plaintext: Buffer.from("@0801SA33\r\n:00000001FF\r\n", "ascii"),
    header: {
      raw: "0801SA33",
      typeBytes: [0x08, 0x01],
      modelId: "SA33",
    },
    sectorErases: [{ raw: "0000", bytes: [0x00, 0x00] }],
    hexRecords: records,
  };
}

describe("flash firmware preflight", () => {
  test("accepts records at the 0x82 payload limit", () => {
    const firmware = firmwareWith([hexRecord(MAX_HEX_RECORD_DATA_BYTES), hexRecord(0, 0x01)]);

    expect(() => validateFlashFirmware(firmware)).not.toThrow();
  });

  test("rejects oversized Intel HEX records before touching the dongle", async () => {
    const firmware = firmwareWith([
      hexRecord(MAX_HEX_RECORD_DATA_BYTES),
      hexRecord(MAX_HEX_RECORD_DATA_BYTES + 1),
      hexRecord(0, 0x01),
    ]);
    const dongle = new RecordingDongle();

    await expect(flashFirmware(dongle, firmware)).rejects.toThrow(/max is 16 bytes/);
    expect(dongle.writes).toBe(0);
  });

  test("rejects unsupported Intel HEX record types before touching the dongle", async () => {
    const firmware = firmwareWith([hexRecord(0, 0x04), hexRecord(0, 0x01)]);
    const dongle = new RecordingDongle();

    await expect(flashFirmware(dongle, firmware)).rejects.toThrow(/unsupported type=0x04/);
    expect(dongle.writes).toBe(0);
  });

  test("rejects non-final EOF records before touching the dongle", async () => {
    const firmware = firmwareWith([hexRecord(0, 0x01), hexRecord(0), hexRecord(0, 0x01)]);
    const dongle = new RecordingDongle();

    await expect(flashFirmware(dongle, firmware)).rejects.toThrow(/EOF record must be the final/);
    expect(dongle.writes).toBe(0);
  });

  test("rejects missing EOF records before touching the dongle", async () => {
    const firmware = firmwareWith([hexRecord(0)]);
    const dongle = new RecordingDongle();

    await expect(flashFirmware(dongle, firmware)).rejects.toThrow(
      /exactly one EOF record; found 0/,
    );
    expect(dongle.writes).toBe(0);
  });
});
