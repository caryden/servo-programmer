/**
 * Unit tests for `axon/src/driver/protocol.ts`, driven against the
 * in-memory `MockDongle` instead of real hardware. Every assertion
 * in this file mirrors a piece of reverse-engineered behavior
 * documented in docs/FINDINGS.md — if a test breaks, it should be
 * because the protocol layer no longer matches the physical dongle.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIG_BLOCK_SIZE,
  identify,
  MAX_CHUNK,
  modelIdFromConfig,
  readChunk,
  readFullConfig,
  writeChunk,
  writeFullConfig,
} from "../../src/driver/protocol.ts";
import type { DongleHandle } from "../../src/driver/transport.ts";
import { AxonError, ExitCode } from "../../src/errors.ts";
import { MockDongle } from "../mocks/mock-dongle.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "../fixtures/dual_test7_config.svo");
const FIXTURE = new Uint8Array(readFileSync(FIXTURE_PATH));

function replyHandle(rx: Buffer): DongleHandle {
  return {
    async write() {},
    async read() {
      return rx;
    },
    async release() {},
  };
}

function txAt(mock: MockDongle, index: number): Buffer {
  const tx = mock.txHistory[index];
  if (tx === undefined) {
    throw new Error(`expected txHistory[${index}]`);
  }
  return tx;
}

describe("identify", () => {
  test("returns PRESENT in primed state", async () => {
    const mock = new MockDongle();
    const reply = await identify(mock);
    expect(reply.present).toBe(true);
    expect(reply.statusHi).toBe(0x01);
    expect(reply.statusLo).toBe(0x00);
    expect(reply.modeByte).toBe(0x03);
    // Ensure exactly one TX went out with the identify command byte.
    expect(mock.txHistory.length).toBe(1);
    const tx0 = txAt(mock, 0);
    expect(tx0[0]).toBe(0x04);
    expect(tx0[1]).toBe(0x8a);
  });

  test("returns absent with statusLo 0xFA in cold state", async () => {
    const mock = new MockDongle();
    mock.state = "cold";
    const reply = await identify(mock);
    expect(reply.present).toBe(false);
    expect(reply.statusLo).toBe(0xfa);
    expect(reply.modeByte).toBe(null);
  });

  test("returns present with unknown mode when identify succeeds with a new mode byte", async () => {
    const rx = Buffer.alloc(64);
    rx[0] = 0x04;
    rx[1] = 0x01;
    rx[2] = 0x00;
    rx[5] = 0x09;

    const reply = await identify(replyHandle(rx));
    expect(reply.present).toBe(true);
    expect(reply.mode).toBe("unknown");
    expect(reply.modeByte).toBe(0x09);
  });

  test("throws servo_io instead of absent for malformed identify replies", async () => {
    const rx = Buffer.alloc(64);
    rx[0] = 0x04;
    rx[1] = 0x8a;
    rx[2] = 0x02;

    let caught: unknown;
    try {
      await identify(replyHandle(rx));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AxonError);
    expect((caught as AxonError).category).toBe("servo_io");
    expect((caught as Error).message).toContain("identify nack");
  });
});

describe("readChunk", () => {
  test("returns the right N bytes from the in-memory config", async () => {
    const mock = new MockDongle();
    const bytes = await readChunk(mock, 0x00, 8);
    expect(bytes.length).toBe(8);
    // First 8 bytes of the SA33**** fixture per docs/FINDINGS.md.
    expect(Array.from(bytes)).toEqual([0x3b, 0xd0, 0x0b, 0xf6, 0x82, 0x82, 0x80, 0x03]);
  });

  test("throws AxonError.notPrimed when rx[2]===0xFA", async () => {
    // Build a minimal DongleHandle that always replies with rx[1]=0x01,
    // rx[2]=0xFA — the "no servo" pattern identify emits in cold state.
    // We exercise the `notPrimed` branch of the readChunk gate
    // directly here because the built-in MockDongle cold-read reply
    // deliberately uses the other (rx[1]=0xCD rx[2]=0x02) pattern.
    const fake: DongleHandle = {
      async write() {},
      async read() {
        const rx = Buffer.alloc(64);
        rx[0] = 0x04;
        rx[1] = 0x01;
        rx[2] = 0xfa;
        return rx;
      },
      async release() {},
    };
    let caught: unknown;
    try {
      await readChunk(fake, 0x00, 8);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AxonError);
    expect((caught as AxonError).code).toBe(ExitCode.NotPrimed);
  });

  test("throws AxonError.servoIo when rx[2]===0x02", async () => {
    const mock = new MockDongle();
    mock.state = "cold"; // built-in cold read gives rx[1]=0xCD rx[2]=0x02
    let caught: unknown;
    try {
      await readChunk(mock, 0x00, 8);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AxonError);
    expect((caught as AxonError).code).toBe(ExitCode.ServoIoError);
  });

  test("rejects length > MAX_CHUNK", async () => {
    const mock = new MockDongle();
    let caught: unknown;
    try {
      await readChunk(mock, 0x00, MAX_CHUNK + 1);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("exceeds max");
    // The chunk size guard must fire BEFORE any TX hits the wire.
    expect(mock.txHistory.length).toBe(0);
  });

  test("returns empty buffer when length===0", async () => {
    const mock = new MockDongle();
    const bytes = await readChunk(mock, 0x00, 0);
    expect(bytes.length).toBe(0);
    // length===0 short-circuits without any HID traffic.
    expect(mock.txHistory.length).toBe(0);
  });
});

describe("readFullConfig", () => {
  test("returns 95 bytes matching the fixture", async () => {
    const mock = new MockDongle();
    const cfg = await readFullConfig(mock);
    expect(cfg.length).toBe(CONFIG_BLOCK_SIZE);
    expect(Array.from(cfg)).toEqual(Array.from(FIXTURE));
  });

  test("does the two-chunk split correctly (59 + 36)", async () => {
    const mock = new MockDongle();
    await readFullConfig(mock);
    // Exactly two read TXs, at addr 0x00 and addr 0x3B, with
    // lengths 0x3B (59) and 0x24 (36). This matches the vendor exe's
    // capture in docs/FINDINGS.md.
    expect(mock.txHistory.length).toBe(2);
    const tx0 = txAt(mock, 0);
    const tx1 = txAt(mock, 1);
    expect(tx0[1]).toBe(0xcd);
    expect(tx0[3]).toBe(0x00);
    expect(tx0[4]).toBe(0x3b);
    expect(tx1[1]).toBe(0xcd);
    expect(tx1[3]).toBe(0x3b);
    expect(tx1[4]).toBe(CONFIG_BLOCK_SIZE - MAX_CHUNK); // 36 (0x24)
  });
});

describe("writeChunk", () => {
  test("updates the in-memory config when primed", async () => {
    const mock = new MockDongle();
    const newBytes = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);
    await writeChunk(mock, 0x10, newBytes);
    expect(Array.from(mock.config.subarray(0x10, 0x14))).toEqual([0xaa, 0xbb, 0xcc, 0xdd]);
    // Surrounding bytes must be untouched.
    expect(mock.config[0x0f]).toBe(0xc8); // fixture byte at 0x0F
    expect(mock.config[0x14]).toBe(0x29); // fixture byte at 0x14
  });

  test("rejects length > MAX_CHUNK", async () => {
    const mock = new MockDongle();
    const tooBig = new Uint8Array(MAX_CHUNK + 1);
    let caught: unknown;
    try {
      await writeChunk(mock, 0x00, tooBig);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("max chunk");
    expect(mock.txHistory.length).toBe(0);
  });
});

describe("writeFullConfig", () => {
  test("updates all 95 bytes via two chunks", async () => {
    const mock = new MockDongle();
    // Start from a zeroed config so the assertion is unambiguous.
    mock.config = Buffer.alloc(CONFIG_BLOCK_SIZE);
    const newCfg = new Uint8Array(CONFIG_BLOCK_SIZE);
    for (let i = 0; i < CONFIG_BLOCK_SIZE; i++) newCfg[i] = i & 0xff;
    await writeFullConfig(mock, newCfg);
    expect(Array.from(mock.config)).toEqual(Array.from(newCfg));
    // Two-chunk split: 59 + 36, matching the read path.
    expect(mock.txHistory.length).toBe(2);
    const tx0 = txAt(mock, 0);
    const tx1 = txAt(mock, 1);
    expect(tx0[3]).toBe(0x00);
    expect(tx0[4]).toBe(0x3b);
    expect(tx1[3]).toBe(0x3b);
    expect(tx1[4]).toBe(CONFIG_BLOCK_SIZE - MAX_CHUNK);
  });

  test("rejects wrong-size input", async () => {
    const mock = new MockDongle();
    let caught: unknown;
    try {
      await writeFullConfig(mock, new Uint8Array(10));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("expected");
    expect(mock.txHistory.length).toBe(0);
  });

  test("read-after-write returns the new bytes", async () => {
    const mock = new MockDongle();
    const newCfg = new Uint8Array(CONFIG_BLOCK_SIZE);
    for (let i = 0; i < CONFIG_BLOCK_SIZE; i++) newCfg[i] = (CONFIG_BLOCK_SIZE - i) & 0xff;
    await writeFullConfig(mock, newCfg);
    const roundtrip = await readFullConfig(mock);
    expect(Array.from(roundtrip)).toEqual(Array.from(newCfg));
  });
});

describe("modelIdFromConfig", () => {
  test("parses 'SA33****' from offset 0x40 of the fixture", () => {
    expect(modelIdFromConfig(FIXTURE)).toBe("SA33****");
  });

  test("strips trailing nulls", () => {
    const cfg = new Uint8Array(CONFIG_BLOCK_SIZE);
    // "SA33" followed by 4 nulls — should yield "SA33" with no garbage.
    cfg[0x40] = 0x53;
    cfg[0x41] = 0x41;
    cfg[0x42] = 0x33;
    cfg[0x43] = 0x33;
    // 0x44..0x47 are already 0 from Uint8Array init.
    expect(modelIdFromConfig(cfg)).toBe("SA33");
  });

  test("returns empty string when offset 0x40 is null", () => {
    const cfg = new Uint8Array(CONFIG_BLOCK_SIZE);
    // All zero → first char is null → loop breaks immediately.
    expect(modelIdFromConfig(cfg)).toBe("");
  });
});
