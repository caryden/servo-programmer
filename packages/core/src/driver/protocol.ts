/**
 * Shared Axon identify/read/write protocol helpers.
 *
 * This layer is intentionally transport-agnostic. The only dependency is
 * the `DongleHandle` abstraction.
 */

import { AxonError } from "../errors.ts";
import type { DongleHandle } from "./transport.ts";

export const REPORT_SIZE = 64;
export const CMD_IDENTIFY = 0x8a;
export const CMD_READ = 0xcd;
export const CMD_WRITE = 0xcb;

export const REPORT_ID = 0x04;
export const CONFIG_BLOCK_SIZE = 95;
export const MAX_CHUNK = 0x3b;
export const CHUNK_SLEEP_MS = 25;
export const WIRE_REPLY_SETTLE_MS = 80;

export type ServoMode = "servo_mode" | "cr_mode" | "unknown";

export interface IdentifyReply {
  present: boolean;
  rawRx: Buffer;
  statusHi: number;
  statusLo: number;
  modeByte: number | null;
  mode: ServoMode;
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
    throw new Error(`buildWriteTx: data is ${data.length} bytes, max chunk is ${MAX_CHUNK}`);
  }
  const tx = Buffer.alloc(REPORT_SIZE);
  tx[0] = REPORT_ID;
  tx[1] = CMD_WRITE;
  tx[2] = (addr >> 8) & 0xff;
  tx[3] = addr & 0xff;
  tx[4] = data.length;
  for (let i = 0; i < data.length; i++) {
    tx[5 + i] = data[i] ?? 0;
  }
  return tx;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function identify(handle: DongleHandle): Promise<IdentifyReply> {
  const tx = buildTx(CMD_IDENTIFY, 0x00, 0x04);
  await handle.write(tx);
  const rx = await handle.read();

  if (rx.length < 3) {
    throw AxonError.servoIo(`identify reply is ${rx.length} bytes, need at least 3`);
  }
  const statusHi = rx[1] ?? 0x00;
  const statusLo = rx[2] ?? 0xff;

  if (statusLo === 0xfa) {
    return {
      present: false,
      rawRx: rx,
      statusHi,
      statusLo,
      modeByte: null,
      mode: "unknown",
    };
  }

  if (statusHi !== 0x01 || statusLo !== 0x00) {
    throw AxonError.servoIo(`identify nack: rx[0..15]: ${hexPrefix(rx, 16)}`);
  }
  if (rx.length < 6) {
    throw AxonError.servoIo(`identify success reply is ${rx.length} bytes, need at least 6`);
  }

  let mode: ServoMode = "unknown";
  const modeByte = rx[5] ?? null;
  if (modeByte === 0x03) mode = "servo_mode";
  else if (modeByte === 0x04) mode = "cr_mode";

  return { present: true, rawRx: rx, statusHi, statusLo, modeByte, mode };
}

function hexPrefix(buf: Buffer, count: number): string {
  return Array.from(buf.subarray(0, count))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

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
  await handle.write(tx);
  await sleep(WIRE_REPLY_SETTLE_MS);
  const rx = await handle.read();
  if (rx.length < 5 + length) {
    throw AxonError.servoIo(`read reply is ${rx.length} bytes, need at least ${5 + length}`);
  }
  if (rx[1] !== 0x01 || rx[2] !== 0x00) {
    if (rx[2] === 0xfa) throw AxonError.notPrimed();
    const statusHi = rx[1] ?? 0;
    const statusLo = rx[2] ?? 0;
    throw AxonError.servoIo(
      `read nack: rx[1]=0x${statusHi.toString(16).padStart(2, "0")} rx[2]=0x${statusLo.toString(16).padStart(2, "0")}`,
    );
  }
  return rx.subarray(5, 5 + length);
}

export async function readFullConfig(handle: DongleHandle): Promise<Buffer> {
  const chunk0 = await readChunk(handle, 0x00, MAX_CHUNK);
  const chunk1 = await readChunk(handle, MAX_CHUNK, CONFIG_BLOCK_SIZE - MAX_CHUNK);
  const full = Buffer.alloc(CONFIG_BLOCK_SIZE);
  full.set(chunk0, 0);
  full.set(chunk1, MAX_CHUNK);
  return full;
}

export async function writeChunk(
  handle: DongleHandle,
  addr: number,
  data: Uint8Array,
): Promise<void> {
  if (data.length === 0) return;
  if (data.length > MAX_CHUNK) {
    throw new Error(`writeChunk: data is ${data.length} bytes, max chunk is ${MAX_CHUNK}`);
  }
  await sleep(CHUNK_SLEEP_MS);
  const tx = buildWriteTx(addr, data);
  await handle.write(tx);
  await sleep(WIRE_REPLY_SETTLE_MS);
  const rx = await handle.read();
  if (rx[1] === 0) {
    const statusLo = rx[2] ?? 0;
    throw AxonError.servoIo(
      `write nack: rx[1]=0 (expected non-zero). rx[2]=0x${statusLo.toString(16).padStart(2, "0")}`,
    );
  }
}

export async function writeFullConfig(handle: DongleHandle, config: Uint8Array): Promise<void> {
  if (config.length !== CONFIG_BLOCK_SIZE) {
    throw new Error(`writeFullConfig: expected ${CONFIG_BLOCK_SIZE} bytes, got ${config.length}`);
  }
  await writeChunk(handle, 0x00, config.subarray(0, MAX_CHUNK));
  await writeChunk(handle, MAX_CHUNK, config.subarray(MAX_CHUNK, CONFIG_BLOCK_SIZE));
}

export function modelIdFromConfig(config: Uint8Array): string {
  let s = "";
  for (let i = 0x40; i < 0x48; i++) {
    const b = config[i];
    if (b === undefined || b === 0x00) break;
    s += String.fromCharCode(b);
  }
  return s;
}
