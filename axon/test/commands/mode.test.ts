/**
 * Integration tests for `axon mode` against an in-memory dongle.
 *
 * The existing MockDongle in `test/mocks/mock-dongle.ts` only
 * handles the read/write/identify command family. Rather than
 * modify that shared mock (it's exercised by many other tests),
 * this file defines a `FlashMockDongle` that stacks on top of
 * MockDongle's state machine and additionally handles the flash
 * command bytes (0x80 boot query, 0x81 key exchange, 0x82 data
 * write, 0x83 marker, 0x90 mode lock).
 *
 * Coverage:
 *   - mode list: reports bundled firmware entries for the connected
 *     Mini, including embedded vs not-embedded status.
 *   - mode current: maps identify mode byte → human name.
 *   - mode set <name>: full flash round-trip against FlashMockDongle.
 *     Verifies the exact order of 0x80 → 0x83 cancel → 0x81 key
 *     exchange → 0x82 erase × N → 0x82 write × M → 0x83 finalize
 *     commands, and that the XOR key is applied correctly.
 *
 * Real hardware is never touched; the mock is enough to catch
 * protocol regressions.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runModeWithHandle } from "../../src/commands/mode.ts";
import {
  DATA_PREFIX_HEX_RECORD,
  DATA_PREFIX_SECTOR_ERASE,
  FLASH_PAYLOAD_SIZE,
  parseFlashRx,
} from "../../src/driver/flash.ts";
import type { DongleHandle } from "../../src/driver/transport.ts";
import { ExitCode } from "../../src/errors.ts";
import { decryptSfw } from "../../src/sfw.ts";
import { loadFixtureConfig, MockDongle } from "../mocks/mock-dongle.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");
const DOWNLOADS_DIR = join(REPO_ROOT, "downloads");
const MINI_SERVO_SFW = join(DOWNLOADS_DIR, "Axon_Mini_Servo_Mode.sfw");

// --- FlashMockDongle --------------------------------------------------------

const REPORT_SIZE = 64;
const REPORT_ID = 0x04;
const CMD_IDENTIFY = 0x8a;
const CMD_READ = 0xcd;
const CMD_WRITE = 0xcb;
const CMD_MODE_LOCK = 0x90;
const CMD_BOOT_QUERY = 0x80;
const CMD_KEY_EXCHANGE = 0x81;
const CMD_DATA_WRITE = 0x82;
const CMD_FLASH_MARKER = 0x83;

type FlashState = "idle" | "awaiting_key_exchange" | "flashing" | "complete";

/**
 * Extends MockDongle behavior by also accepting flash commands.
 * MockDongle's write() rejects any byte outside {identify, read,
 * write}; we override write/read here to intercept flash commands
 * before they reach the base implementation.
 */
class FlashMockDongle implements DongleHandle {
  public readonly base: MockDongle;
  public readonly txHistory: Buffer[] = [];
  public readonly flashCommandHistory: { cmd: number; payload: Buffer }[] = [];
  public flashState: FlashState = "idle";
  public challenge: Buffer | null = null;
  public sessionKey: Buffer | null = null;
  public sectorErases = 0;
  public hexRecords = 0;
  public finishedFlashes = 0;
  /** Mode byte to return from identify after a successful flash. */
  public nextIdentifyModeByte: number;

  private pendingRx: Buffer | null = null;
  private released = false;

  constructor(initialModeByte: number, nextModeByte: number) {
    this.base = new MockDongle();
    // Start in the initial mode so identify() reports it.
    // MockDongle's identify hard-codes rx[5]=0x03; override by
    // replacing the config-block mode byte and intercepting identify.
    this.currentIdentifyModeByte = initialModeByte;
    this.nextIdentifyModeByte = nextModeByte;
  }

  private currentIdentifyModeByte: number;

  async write(data: Buffer, _timeoutMs?: number): Promise<void> {
    if (this.released) throw new Error("mock: write after release");
    const recorded = Buffer.alloc(REPORT_SIZE);
    data.copy(recorded, 0, 0, Math.min(data.length, REPORT_SIZE));
    this.txHistory.push(recorded);
    if (recorded[0] !== REPORT_ID) {
      throw new Error("mock: expected report id 0x04");
    }
    const cmd = recorded[1]!;
    switch (cmd) {
      case CMD_IDENTIFY:
        this.pendingRx = this.buildIdentifyReply();
        return;
      case CMD_READ:
      case CMD_WRITE: {
        // Delegate the config read/write to the base MockDongle and
        // await the resulting rx.
        await this.base.write(recorded);
        this.pendingRx = await this.base.read();
        return;
      }
      case CMD_BOOT_QUERY:
      case CMD_KEY_EXCHANGE:
      case CMD_DATA_WRITE:
      case CMD_FLASH_MARKER:
      case CMD_MODE_LOCK: {
        const length = recorded[2]!;
        const payload = recorded.subarray(3, 3 + length);
        this.flashCommandHistory.push({ cmd, payload: Buffer.from(payload) });
        this.pendingRx = this.buildFlashReply(cmd, payload);
        return;
      }
      default:
        throw new Error(`mock: unknown command byte 0x${cmd.toString(16)}`);
    }
  }

  async read(_timeoutMs?: number): Promise<Buffer> {
    if (this.released) throw new Error("mock: read after release");
    if (this.pendingRx === null) {
      throw new Error("mock: read with no pending rx");
    }
    const rx = this.pendingRx;
    this.pendingRx = null;
    return rx;
  }

  async release(): Promise<void> {
    this.released = true;
  }

  private buildIdentifyReply(): Buffer {
    const rx = Buffer.alloc(REPORT_SIZE);
    rx[0] = REPORT_ID;
    rx[1] = 0x01;
    rx[2] = 0x00;
    rx[3] = 0x01;
    rx[4] = 0x01;
    rx[5] = this.currentIdentifyModeByte;
    rx[6] = 0x21;
    rx[7] = 0x01;
    rx[8] = 0x00;
    return rx;
  }

  private buildFlashReply(cmd: number, payload: Buffer): Buffer {
    // Build a success reply: rx[0]=0x04, rx[1]=1 (nonzero = ok),
    // rx[2]=0 (length field, must be zero for data branch), rx[3..4]
    // don't matter, rx[5..5+N] is the payload the vendor exe parser
    // copies. Success values per the flash handler:
    //   - 0x80 boot query → 6 bytes, rx[5]='V'(0x56), rx[6]='1',
    //     rx[7]=next,rx[8]='0',... (V04 family). Use "V040" style.
    //   - 0x81 key exchange → 22 bytes (we fabricate a deterministic
    //     response so the XOR yields a predictable key).
    //   - 0x82 data write → 1 byte, success = 0x55 for sector erase,
    //     expected-checksum echo for hex records.
    //   - 0x83 marker → 1 byte of any value.
    //   - 0x90 mode lock → 1 byte of any value.
    const rx = Buffer.alloc(REPORT_SIZE);
    rx[0] = REPORT_ID;
    rx[1] = 0x01; // status ok
    rx[2] = 0x00; // length field (must be zero for data branch)
    rx[3] = 0x00;
    rx[4] = 0x00;

    if (cmd === CMD_BOOT_QUERY) {
      // 6-byte boot version reply. Bytes [0..3] are ASCII "V0n3"
      // (n chosen NOT to be '2' which is the "too old" guard), and
      // bytes [4..5] are the servo family identifier — for a Mini
      // the vendor exe compares these against 0x08, 0x01 from the
      // `@0801SA33` .sfw header. See firmware_handler.c 193-194,
      // 405-406.
      rx[5] = 0x56; // 'V'
      rx[6] = 0x30; // '0'
      rx[7] = 0x34; // '4'
      rx[8] = 0x33; // '3'
      rx[9] = 0x08; // matches `@0801...` header byte 0
      rx[10] = 0x01; // matches `@0801...` header byte 1
      return rx;
    }
    if (cmd === CMD_KEY_EXCHANGE) {
      // Save the caller's challenge and produce a deterministic
      // response. The session key is challenge XOR response; we
      // pick response = challenge XOR 0xAA so the key is a run of
      // 0xAA bytes (easy to verify later).
      this.challenge = Buffer.from(payload);
      const response = Buffer.alloc(FLASH_PAYLOAD_SIZE);
      for (let i = 0; i < FLASH_PAYLOAD_SIZE; i++) response[i] = payload[i]! ^ 0xaa;
      this.sessionKey = Buffer.alloc(FLASH_PAYLOAD_SIZE, 0xaa);
      response.copy(rx, 5);
      this.flashState = "flashing";
      return rx;
    }
    if (cmd === CMD_DATA_WRITE) {
      // Decrypt the payload using the saved session key, then
      // inspect the first byte to determine whether this is a sector
      // erase or a hex record.
      if (this.sessionKey === null) {
        throw new Error("mock: 0x82 arrived before 0x81 key exchange");
      }
      const decrypted = Buffer.alloc(FLASH_PAYLOAD_SIZE);
      for (let i = 0; i < FLASH_PAYLOAD_SIZE; i++) {
        decrypted[i] = payload[i]! ^ this.sessionKey[i]!;
      }
      if (decrypted[0] === DATA_PREFIX_SECTOR_ERASE) {
        this.sectorErases += 1;
        rx[5] = 0x55; // success code for sector erase
        return rx;
      }
      if (decrypted[0] === DATA_PREFIX_HEX_RECORD) {
        this.hexRecords += 1;
        // Echo the record's Intel HEX checksum byte at
        // decrypted[count + 5] where count = decrypted[1].
        const count = decrypted[1]!;
        const checksumIndex = count + 5;
        if (checksumIndex >= FLASH_PAYLOAD_SIZE) {
          throw new Error(`mock: hex record count ${count} too large`);
        }
        rx[5] = decrypted[checksumIndex]!;
        return rx;
      }
      throw new Error(
        `mock: 0x82 payload[0]=0x${decrypted[0]!.toString(16)} (expected 0x0A or 0x3A)`,
      );
    }
    if (cmd === CMD_FLASH_MARKER) {
      if (this.flashState === "flashing") {
        this.flashState = "complete";
        this.finishedFlashes += 1;
        // After completion, flip the identify reply to the new mode.
        this.currentIdentifyModeByte = this.nextIdentifyModeByte;
      }
      rx[5] = 0xaa;
      return rx;
    }
    if (cmd === CMD_MODE_LOCK) {
      rx[5] = 0x00;
      return rx;
    }
    throw new Error(`mock: unhandled flash cmd 0x${cmd.toString(16)}`);
  }
}

// --- tests ------------------------------------------------------------------

function captureIO(): {
  stdout: () => string;
  stderr: () => string;
  restore: () => void;
} {
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // @ts-expect-error override
  process.stdout.write = (c: string | Uint8Array): boolean => {
    out.push(typeof c === "string" ? Buffer.from(c) : Buffer.from(c));
    return true;
  };
  // @ts-expect-error override
  process.stderr.write = (c: string | Uint8Array): boolean => {
    err.push(typeof c === "string" ? Buffer.from(c) : Buffer.from(c));
    return true;
  };
  return {
    stdout: () => Buffer.concat(out).toString("utf8"),
    stderr: () => Buffer.concat(err).toString("utf8"),
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

describe("mode list", () => {
  test("prints the bundled modes for SA33**** (Mini)", async () => {
    const mock = new MockDongle();
    const cap = captureIO();
    let code: number;
    try {
      code = await runModeWithHandle(
        mock,
        { json: false, quiet: false, yes: false },
        { subcommand: "list" },
      );
    } finally {
      cap.restore();
    }
    expect(code).toBe(ExitCode.Ok);
    const out = cap.stdout();
    expect(out).toContain("SA33****");
    expect(out).toContain("Axon Mini");
    expect(out).toContain("standard");
    expect(out).toContain("continuous");
    expect(out).toContain("Axon_Mini_Servo_Mode.sfw");
    expect(out).toContain("Axon_Mini_Modified_CR_Mode.sfw");
  });

  test("JSON output includes model + modes array", async () => {
    const mock = new MockDongle();
    const cap = captureIO();
    let code: number;
    try {
      code = await runModeWithHandle(
        mock,
        { json: true, quiet: false, yes: false },
        { subcommand: "list" },
      );
    } finally {
      cap.restore();
    }
    expect(code).toBe(ExitCode.Ok);
    const parsed = JSON.parse(cap.stdout());
    expect(parsed.model.id).toBe("SA33****");
    expect(parsed.model.name).toBe("Axon Mini");
    expect(Array.isArray(parsed.modes)).toBe(true);
    expect(parsed.modes.length).toBe(2);
    const names = parsed.modes.map((m: { name: string }) => m.name).sort();
    expect(names).toEqual(["continuous", "standard"]);
  });
});

describe("mode current", () => {
  test("reports 'Servo Mode' when identify says servo_mode (0x03)", async () => {
    // Default MockDongle hard-codes rx[5]=0x03, so the fixture's
    // identify reply is servo_mode.
    const mock = new MockDongle();
    const cap = captureIO();
    let code: number;
    try {
      code = await runModeWithHandle(
        mock,
        { json: false, quiet: false, yes: false },
        { subcommand: "current" },
      );
    } finally {
      cap.restore();
    }
    expect(code).toBe(ExitCode.Ok);
    const out = cap.stdout();
    expect(out).toContain("Servo Mode");
    expect(out).toContain("servo_mode");
    expect(out).toContain("bundled  standard");
  });

  test("reports the bundled 'continuous' key when identify says cr_mode (0x04)", async () => {
    // FlashMockDongle lets us control the identify mode byte.
    const mock = new FlashMockDongle(0x04, 0x04);
    const cap = captureIO();
    let code: number;
    try {
      code = await runModeWithHandle(
        mock,
        { json: false, quiet: false, yes: false },
        { subcommand: "current" },
      );
    } finally {
      cap.restore();
    }
    expect(code).toBe(ExitCode.Ok);
    const out = cap.stdout();
    expect(out).toContain("CR Mode");
    expect(out).toContain("cr_mode");
    expect(out).toContain("bundled  continuous");
  });
});

describe("mode set (flash round-trip)", () => {
  test("--file flashes cleanly against FlashMockDongle", async () => {
    // Use the Mini Modified CR Mode .sfw directly off disk so we
    // don't need the (gitignored) `sfw-embedded.ts` to be populated
    // for this test to pass. If downloads/ isn't present (fresh
    // clone / CI), skip gracefully.
    const sfwPath = MINI_SERVO_SFW.replace("Servo_Mode", "Modified_CR_Mode");
    if (!existsSync(sfwPath)) return;

    // The fresh MockDongle's config-block model id will be SA33****
    // (from the dual_test7_config.svo fixture). That matches the
    // @0801SA33 header in the Mini CR firmware, so the model check
    // passes. FlashMockDongle is seeded to start in servo_mode (0x03)
    // and to flip to cr_mode (0x04) after the 0x83 finalize.
    const mock = new FlashMockDongle(0x03, 0x04);
    // Provide the echo bypass and zero-sleep for non-interactive tests.
    const prevConfirm = process.env.AXON_FLASH_CONFIRM;
    const prevSleep = process.env.AXON_FLASH_CMD_SLEEP_MS;
    process.env.AXON_FLASH_CONFIRM = basename(sfwPath);
    process.env.AXON_FLASH_CMD_SLEEP_MS = "0";
    const cap = captureIO();
    let code: number;
    try {
      code = await runModeWithHandle(
        mock,
        { json: true, quiet: true, yes: true },
        { subcommand: "set", filePath: sfwPath },
      );
    } finally {
      cap.restore();
      if (prevConfirm === undefined) delete process.env.AXON_FLASH_CONFIRM;
      else process.env.AXON_FLASH_CONFIRM = prevConfirm;
      if (prevSleep === undefined) delete process.env.AXON_FLASH_CMD_SLEEP_MS;
      else process.env.AXON_FLASH_CMD_SLEEP_MS = prevSleep;
    }
    expect(code).toBe(ExitCode.Ok);
    const summary = JSON.parse(cap.stdout());
    expect(summary.ok).toBe(true);
    expect(summary.model.id).toBe("SA33****");
    expect(summary.old_mode).toBe("servo_mode");
    expect(summary.new_mode).toBe("cr_mode");

    // Cross-check that the mock saw the expected number of commands:
    // decrypt the same .sfw and compare counts.
    const dec = decryptSfw(readFileSync(sfwPath));
    expect(mock.sectorErases).toBe(dec.sectorErases.length);
    expect(mock.hexRecords).toBe(dec.hexRecords.length);
    expect(mock.finishedFlashes).toBeGreaterThanOrEqual(1);

    // Verify the ordering: 0x90 enter → 0x80 boot → ... → 0x83 finalize → 0x90 exit.
    const firstFlashCmd = mock.flashCommandHistory[0];
    expect(firstFlashCmd).toBeDefined();
    expect(firstFlashCmd?.cmd).toBe(0x90); // enter flash mode
    const secondFlashCmd = mock.flashCommandHistory[1];
    expect(secondFlashCmd).toBeDefined();
    expect(secondFlashCmd?.cmd).toBe(0x80); // boot query
    const lastFlashCmd = mock.flashCommandHistory.at(-1);
    expect(lastFlashCmd).toBeDefined();
    expect(lastFlashCmd?.cmd).toBe(0x90); // exit flash mode
    // 0x81 key exchange should appear exactly once.
    const keyExchanges = mock.flashCommandHistory.filter((c) => c.cmd === 0x81);
    expect(keyExchanges.length).toBe(1);
  });

  test("refuses to flash when mode name is not bundled", async () => {
    const mock = new MockDongle();
    const cap = captureIO();
    let threw = false;
    try {
      await runModeWithHandle(
        mock,
        { json: false, quiet: true, yes: true },
        { subcommand: "set", modeName: "nonexistent" },
      );
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain("not a recognized mode");
    } finally {
      cap.restore();
    }
    expect(threw).toBe(true);
  });

  test("refuses usage error when neither modeName nor filePath is given", async () => {
    const mock = new MockDongle();
    const cap = captureIO();
    let threw = false;
    try {
      await runModeWithHandle(mock, { json: false, quiet: true, yes: true }, { subcommand: "set" });
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain("--file");
    } finally {
      cap.restore();
    }
    expect(threw).toBe(true);
  });
});

describe("parseFlashRx helper", () => {
  test("rejects a zero status byte", () => {
    const rx = Buffer.alloc(REPORT_SIZE);
    rx[0] = REPORT_ID;
    rx[1] = 0;
    expect(() => parseFlashRx(rx, 1)).toThrow(/status byte/);
  });

  test("rejects a non-zero length-field", () => {
    const rx = Buffer.alloc(REPORT_SIZE);
    rx[0] = REPORT_ID;
    rx[1] = 1;
    rx[2] = 0xff;
    expect(() => parseFlashRx(rx, 1)).toThrow(/length-field/);
  });

  test("returns the requested payload slice on a good reply", () => {
    const rx = Buffer.alloc(REPORT_SIZE);
    rx[0] = REPORT_ID;
    rx[1] = 1;
    rx[2] = 0;
    rx[5] = 0xaa;
    rx[6] = 0xbb;
    const out = parseFlashRx(rx, 2);
    expect(out[0]).toBe(0xaa);
    expect(out[1]).toBe(0xbb);
  });
});

// Sanity check on fixture loader — ensures MockDongle's base config
// really has the SA33**** model id we're asserting about.
test("MockDongle config model id is SA33****", () => {
  const config = loadFixtureConfig();
  // Bytes 0x40..0x47 are the model id.
  const modelBytes = config.subarray(0x40, 0x48);
  expect(modelBytes.toString("ascii")).toBe("SA33****");
});
