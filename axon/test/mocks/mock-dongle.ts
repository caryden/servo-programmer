/**
 * MockDongle — an in-memory, state-machine implementation of the
 * `DongleHandle` transport interface from `axon/src/driver/transport.ts`.
 *
 * The mock is a "virtual dongle": it holds a real 95-byte config
 * block in memory and responds to identify / read / write commands
 * the same way the physical Axon dongle does on the wire — including
 * the "cold state" failure modes we reverse-engineered. That's
 * intentional. A trivial canned-response mock would catch typos but
 * not protocol bugs; by encoding the actual reverse-engineered
 * behavior we get tests that break for the *same* reasons the real
 * hardware breaks, without needing a dongle plugged in.
 *
 * Behavior is derived from:
 *   - docs/FINDINGS.md "Wire protocol decoded", "HID reply format",
 *     and "Prime state matters" sections
 *   - research/saleae-captures/dual_test7_623.csv (wire capture)
 *   - research/static-analysis/ghidra_out/param_helper_READ_004047d0.c
 *
 * Contract summary (see `axon/src/driver/protocol.ts` for the
 * production protocol layer that exercises this mock):
 *
 *   tx[0] = 0x04        HID report id
 *   tx[1] = cmd         0x8A identify | 0xCD read | 0xCB write
 *   tx[2] = addr_hi     always 0 in practice (config block is 95 bytes)
 *   tx[3] = addr_lo     request address into the config block
 *   tx[4] = length      chunk length (0..MAX_CHUNK=59)
 *   tx[5..5+length]     write payload (only on 0xCB)
 *
 *   rx[0] = 0x04        HID report id echo
 *   rx[1] = status_hi   0x01 OK, else command byte echoed (NACK)
 *   rx[2] = status_lo   0x00 OK, 0xFA no servo, 0x02 not executed
 *   rx[3] = addr echo
 *   rx[4] = length echo
 *   rx[5..5+length]     wire data (for reads) / zero for writes
 *   rx[5+length..63]    zero padding
 *
 * The mock has zero dependency on node-hid or any USB library. It
 * is pure TypeScript running against Node/Bun Buffer.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DongleHandle } from "../../src/driver/transport.ts";

const REPORT_SIZE = 64;
const CONFIG_BLOCK_SIZE = 95;
const REPORT_ID = 0x04;

const CMD_IDENTIFY = 0x8a;
const CMD_READ = 0xcd;
const CMD_WRITE = 0xcb;

export type MockDongleState = "primed" | "cold" | "disconnected";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "../fixtures/dual_test7_config.svo");

/**
 * Load the bundled 95-byte config fixture as a fresh Buffer. Called
 * by the default MockDongle constructor; tests that want a different
 * seed can pass their own buffer.
 */
export function loadFixtureConfig(): Buffer {
  const bytes = readFileSync(FIXTURE_PATH);
  if (bytes.length !== CONFIG_BLOCK_SIZE) {
    throw new Error(
      `mock-dongle: fixture ${FIXTURE_PATH} is ${bytes.length} bytes, expected ${CONFIG_BLOCK_SIZE}`,
    );
  }
  // Return a fresh copy so mutations by one test never leak into another.
  return Buffer.from(bytes);
}

/**
 * In-memory `DongleHandle` implementation backed by a real 95-byte
 * config block and a three-state state machine. See the module
 * header for the full contract.
 */
export class MockDongle implements DongleHandle {
  /** Mutable state. Tests may set this directly to simulate bus resets. */
  public state: MockDongleState = "primed";

  /**
   * The in-memory 95-byte config block. Test code can read this
   * after a write to assert the protocol layer actually landed the
   * bytes, or replace it wholesale to simulate a different servo.
   */
  public config: Buffer;

  /**
   * Every TX buffer the caller has sent, in order. Tests use this to
   * assert exact byte sequences (e.g. "readFullConfig sends exactly
   * two 0xCD commands at addr 0 and addr 0x3B").
   */
  public readonly txHistory: Buffer[] = [];

  private pendingRx: Buffer | null = null;
  private released = false;

  constructor(seed?: Buffer) {
    this.config = seed ? Buffer.from(seed) : loadFixtureConfig();
    if (this.config.length !== CONFIG_BLOCK_SIZE) {
      throw new Error(
        `MockDongle: seed must be exactly ${CONFIG_BLOCK_SIZE} bytes, got ${this.config.length}`,
      );
    }
  }

  // ---------------------------------------------------------------
  // DongleHandle interface
  // ---------------------------------------------------------------

  write(data: Buffer, _timeoutMs?: number): Promise<void> {
    if (this.released) {
      return Promise.reject(new Error("mock-dongle: write after release"));
    }
    if (this.state === "disconnected") {
      return Promise.reject(new Error("mock-dongle: device is disconnected"));
    }

    // Record the TX for test assertions. Pad to the full report size
    // so historical entries look like what the real transport sends.
    const recorded = Buffer.alloc(REPORT_SIZE);
    data.copy(recorded, 0, 0, Math.min(data.length, REPORT_SIZE));
    this.txHistory.push(recorded);

    if (recorded[0] !== REPORT_ID) {
      return Promise.reject(
        new Error(
          `mock-dongle: expected tx[0]=0x04 (report id), got 0x${recorded[0]!
            .toString(16)
            .padStart(2, "0")}`,
        ),
      );
    }

    const cmd = recorded[1]!;
    // Address is 16-bit (hi at tx[2], lo at tx[3]); the real dongle
    // drops the high byte before forwarding to the wire, but we
    // honor it here so off-by-one bugs that set the wrong byte
    // still show up as a wrong address.
    const addr = ((recorded[2]! << 8) | recorded[3]!) & 0xffff;
    const length = recorded[4]!;

    switch (cmd) {
      case CMD_IDENTIFY:
        this.pendingRx = this.buildIdentifyReply();
        return Promise.resolve();

      case CMD_READ:
        this.pendingRx = this.buildReadReply(addr, length);
        return Promise.resolve();

      case CMD_WRITE: {
        const payload = recorded.subarray(5, 5 + length);
        this.pendingRx = this.buildWriteReply(addr, length, payload);
        return Promise.resolve();
      }

      default:
        return Promise.reject(
          new Error(
            `mock-dongle: unknown command byte 0x${cmd
              .toString(16)
              .padStart(2, "0")} (tests must exercise only identify/read/write)`,
          ),
        );
    }
  }

  read(_timeoutMs?: number): Promise<Buffer> {
    if (this.released) {
      return Promise.reject(new Error("mock-dongle: read after release"));
    }
    if (this.state === "disconnected") {
      return Promise.reject(new Error("mock-dongle: device is disconnected"));
    }
    if (this.pendingRx === null) {
      return Promise.reject(
        new Error("mock-dongle: read with no pending response (write/read ordering bug?)"),
      );
    }
    const rx = this.pendingRx;
    this.pendingRx = null;
    return Promise.resolve(rx);
  }

  release(): Promise<void> {
    this.released = true;
    this.state = "disconnected";
    this.pendingRx = null;
    return Promise.resolve();
  }

  // ---------------------------------------------------------------
  // Internal reply builders
  // ---------------------------------------------------------------

  /**
   * Canonical PRESENT reply in primed state, 0xFA "no servo" reply
   * in cold state. See docs/FINDINGS.md "HID reply format" and the
   * `identify()` gate in `axon/src/driver/protocol.ts`:
   *
   *   present = rx[1]===0x01 && rx[2]===0x00
   *          && (rx[5]===0x03 || rx[5]===0x04)
   *          && rx[7]===0x01
   */
  private buildIdentifyReply(): Buffer {
    const rx = Buffer.alloc(REPORT_SIZE);
    rx[0] = REPORT_ID;
    if (this.state === "primed") {
      // rx[1]=status_hi OK, rx[2]=status_lo OK, rx[3/4] are addr/len
      // echoes (the identify request carries addr=0x00, length=0x04
      // in the protocol layer, but the wire-observed reply has rx[3]
      // and rx[4] nonzero — we use 0x01,0x01 to match the canonical
      // fixture in axon/test/fixtures/identify_reply.hex).
      rx[1] = 0x01;
      rx[2] = 0x00;
      rx[3] = 0x01;
      rx[4] = 0x01;
      // rx[5..8] are the four servo wire-reply params. Protocol
      // layer gates on rx[5] in {0x03,0x04} and rx[7]===0x01.
      rx[5] = 0x03;
      rx[6] = 0x21;
      rx[7] = 0x01;
      rx[8] = 0x00;
    } else {
      // Cold state: identify returns rx[2]=0xFA "no servo".
      rx[1] = 0x01;
      rx[2] = 0xfa;
    }
    return rx;
  }

  /**
   * Primed: echo wire data from the in-memory config block.
   * Cold: NACK with rx[1]=0xCD (command echoed) and rx[2]=0x02.
   */
  private buildReadReply(addr: number, length: number): Buffer {
    const rx = Buffer.alloc(REPORT_SIZE);
    rx[0] = REPORT_ID;
    if (this.state === "primed") {
      if (addr + length > CONFIG_BLOCK_SIZE) {
        // Real hardware would NACK an out-of-range read; surface as
        // a test error so ordering bugs are loud.
        throw new Error(
          `mock-dongle: read out of range addr=${addr} length=${length} (config is ${CONFIG_BLOCK_SIZE} bytes)`,
        );
      }
      rx[1] = 0x01;
      rx[2] = 0x00;
      rx[3] = addr & 0xff;
      rx[4] = length;
      this.config.copy(rx, 5, addr, addr + length);
    } else {
      // Cold state: the de-primed read NACK we observed in
      // research/python-tests/axon_libusb_test_status output.
      rx[1] = CMD_READ; // 0xCD echoed back
      rx[2] = 0x02;
      rx[3] = addr & 0xff;
      rx[4] = length;
    }
    return rx;
  }

  /**
   * Primed: apply the write to the in-memory config block and
   * return a success reply. Cold state writes are not modeled here
   * — the tests don't exercise that path and writes in cold state
   * on the real hardware are fire-and-forget with undefined
   * observable behavior.
   */
  private buildWriteReply(addr: number, length: number, payload: Buffer): Buffer {
    const rx = Buffer.alloc(REPORT_SIZE);
    rx[0] = REPORT_ID;
    if (this.state === "primed") {
      if (addr + length > CONFIG_BLOCK_SIZE) {
        throw new Error(
          `mock-dongle: write out of range addr=${addr} length=${length} (config is ${CONFIG_BLOCK_SIZE} bytes)`,
        );
      }
      if (payload.length < length) {
        throw new Error(
          `mock-dongle: write payload is ${payload.length} bytes, length field is ${length}`,
        );
      }
      // Apply the write to the in-memory config.
      payload.copy(this.config, addr, 0, length);
      rx[1] = 0x01;
      rx[2] = 0x00;
      rx[3] = addr & 0xff;
      rx[4] = length;
    } else {
      rx[1] = CMD_WRITE; // 0xCB echoed back
      rx[2] = 0x02;
      rx[3] = addr & 0xff;
      rx[4] = length;
    }
    return rx;
  }
}
