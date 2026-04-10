/**
 * Axon dongle HID protocol — identify, read config, write config.
 *
 * The dongle is a transparent proxy to a Dynamixel-v1-like wire
 * protocol at 9600 baud. HID command bytes (0x8A identify, 0xCD
 * read, 0xCB write) are the same bytes that appear on the wire as
 * the INSTR field. The HID reply contains the raw bytes from the
 * servo's wire reply at rx[5..5+N], with rx[0]=0x04 (report id),
 * rx[1]=status-hi (0x01=OK), rx[2]=status-lo (0x00=OK, 0xFA=no
 * servo, 0x02=nack), rx[3]=addr echo, rx[4]=length echo.
 *
 * See docs/FINDINGS.md "Wire protocol decoded" and "HID reply
 * format" sections for the full derivation, and
 * tools/ghidra_out/param_helper_READ_004047d0_FUN_004047d0.c for
 * the vendor exe's equivalent function. Notable constants taken
 * from that decomp:
 *
 *   - max chunk size = 59 bytes (0x3B)
 *   - minimum inter-chunk sleep = 25 ms (Sleep(0x19))
 *   - read success gate: rx[1] != 0 AND rx[2] == 0
 *   - write success gate: rx[1] != 0 (rx[2] is NOT checked on write)
 */

import { AxonError } from "../errors.ts";
import {
  hidRead,
  hidWrite,
  REPORT_SIZE,
  type DongleHandle,
} from "./hid.ts";

export const CMD_IDENTIFY = 0x8a;
export const CMD_READ = 0xcd;
export const CMD_WRITE = 0xcb;

export const REPORT_ID = 0x04;
export const CONFIG_BLOCK_SIZE = 95;
export const MAX_CHUNK = 0x3b; // 59
export const CHUNK_SLEEP_MS = 25;
export const WIRE_REPLY_SETTLE_MS = 80; // empirically adequate for 9600 baud

export interface IdentifyReply {
  present: boolean;
  rawRx: Buffer;
  statusLo: number; // rx[2]: 0x00 ok, 0xFA no servo, etc.
}

function buildTx(cmd: number, addr: number, length: number): Buffer {
  const tx = Buffer.alloc(REPORT_SIZE);
  tx[0] = REPORT_ID;
  tx[1] = cmd;
  tx[2] = (addr >> 8) & 0xff;
  tx[3] = addr & 0xff;
  tx[4] = length;
  return tx;
}

function buildWriteTx(addr: number, data: Uint8Array): Buffer {
  if (data.length > MAX_CHUNK) {
    throw new Error(
      `buildWriteTx: data is ${data.length} bytes, max chunk is ${MAX_CHUNK}`,
    );
  }
  const tx = Buffer.alloc(REPORT_SIZE);
  tx[0] = REPORT_ID;
  tx[1] = CMD_WRITE;
  tx[2] = (addr >> 8) & 0xff;
  tx[3] = addr & 0xff;
  tx[4] = data.length;
  for (let i = 0; i < data.length; i++) {
    tx[5 + i] = data[i]!;
  }
  return tx;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send one identify (`0x8A`) and classify the reply. Does NOT throw
 * when the servo reports absent — returns `present: false` so
 * callers like the monitor can handle transitions themselves.
 */
export async function identify(
  handle: DongleHandle,
): Promise<IdentifyReply> {
  const tx = buildTx(CMD_IDENTIFY, 0x00, 0x04);
  await hidWrite(handle, tx);
  const rx = await hidRead(handle);
  // Well-known PRESENT fingerprint: rx[1]=0x01, rx[2]=0x00, rx[5] is
  // either 0x03 or 0x04 (we've seen 0x03 from the Mini), rx[7]=0x01.
  const present =
    rx.length >= 8 &&
    rx[1] === 0x01 &&
    rx[2] === 0x00 &&
    (rx[5] === 0x03 || rx[5] === 0x04) &&
    rx[7] === 0x01;
  return { present, rawRx: rx, statusLo: rx[2] ?? 0xff };
}

/**
 * Read up to MAX_CHUNK bytes from the given config-block address.
 * Throws `AxonError.notPrimed()` if the dongle is in cold state
 * (the most common recoverable failure) or `AxonError.servoIo()`
 * for any other unexpected failure.
 */
export async function readChunk(
  handle: DongleHandle,
  addr: number,
  length: number,
): Promise<Buffer> {
  if (length === 0) return Buffer.alloc(0);
  if (length > MAX_CHUNK) {
    throw new Error(`readChunk: length ${length} exceeds max ${MAX_CHUNK}`);
  }
  await sleep(CHUNK_SLEEP_MS);
  const tx = buildTx(CMD_READ, addr, length);
  await hidWrite(handle, tx);
  await sleep(WIRE_REPLY_SETTLE_MS);
  const rx = await hidRead(handle);
  if (rx[1] !== 0x01 || rx[2] !== 0x00) {
    // Distinguish "no servo" from other failures so the user gets a
    // useful recovery hint.
    if (rx[2] === 0xfa) throw AxonError.notPrimed();
    throw AxonError.servoIo(
      `read nack: rx[1]=0x${rx[1]!.toString(16).padStart(2, "0")} rx[2]=0x${rx[2]!.toString(16).padStart(2, "0")}`,
    );
  }
  return rx.subarray(5, 5 + length);
}

/**
 * Read the full 95-byte config block, transparently handling the
 * two-chunk (59 + 36) split the dongle requires.
 */
export async function readFullConfig(
  handle: DongleHandle,
): Promise<Buffer> {
  const chunk0 = await readChunk(handle, 0x00, MAX_CHUNK);
  const chunk1 = await readChunk(handle, MAX_CHUNK, CONFIG_BLOCK_SIZE - MAX_CHUNK);
  const full = Buffer.alloc(CONFIG_BLOCK_SIZE);
  chunk0.copy(full, 0);
  chunk1.copy(full, MAX_CHUNK);
  return full;
}

/**
 * Write up to MAX_CHUNK bytes to the given config-block address.
 * Write success gate per the vendor exe decomp is `rx[1] != 0`
 * only — rx[2] is not checked on writes, consistent with our wire
 * observation that writes are fire-and-forget on the 1-wire link.
 */
export async function writeChunk(
  handle: DongleHandle,
  addr: number,
  data: Uint8Array,
): Promise<void> {
  if (data.length === 0) return;
  if (data.length > MAX_CHUNK) {
    throw new Error(
      `writeChunk: data is ${data.length} bytes, max chunk is ${MAX_CHUNK}`,
    );
  }
  await sleep(CHUNK_SLEEP_MS);
  const tx = buildWriteTx(addr, data);
  await hidWrite(handle, tx);
  await sleep(WIRE_REPLY_SETTLE_MS);
  const rx = await hidRead(handle);
  if (rx[1] === 0) {
    throw AxonError.servoIo(
      `write nack: rx[1]=0 (expected non-zero). rx[2]=0x${rx[2]!.toString(16).padStart(2, "0")}`,
    );
  }
}

/**
 * Write the full 95-byte config block in two chunks matching the
 * vendor exe's pattern.
 */
export async function writeFullConfig(
  handle: DongleHandle,
  config: Uint8Array,
): Promise<void> {
  if (config.length !== CONFIG_BLOCK_SIZE) {
    throw new Error(
      `writeFullConfig: expected ${CONFIG_BLOCK_SIZE} bytes, got ${config.length}`,
    );
  }
  await writeChunk(handle, 0x00, config.subarray(0, MAX_CHUNK));
  await writeChunk(
    handle,
    MAX_CHUNK,
    config.subarray(MAX_CHUNK, CONFIG_BLOCK_SIZE),
  );
}

/**
 * Parse the model id from a full 95-byte config block. Model id
 * lives at offset 0x40..0x47 as ASCII with '*' padding.
 */
export function modelIdFromConfig(config: Uint8Array): string {
  let s = "";
  for (let i = 0x40; i < 0x48; i++) {
    const b = config[i];
    if (b === undefined || b === 0x00) break;
    s += String.fromCharCode(b);
  }
  return s;
}
