/**
 * Axon dongle firmware-flash wire protocol.
 *
 * This module implements the HID-side command sequence the vendor
 * exe uses to flash a new .sfw firmware to the connected servo.
 * It is NOT the same command family as the config read/write
 * protocol in `protocol.ts` — the flash commands live in a separate
 * group (0x80..0x83, 0x90) and use a different HID OUT layout:
 *
 *     tx[0] = 0x04           // report id
 *     tx[1] = <command>      // 0x80 / 0x81 / 0x82 / 0x83 / 0x90
 *     tx[2] = <length>       // payload byte count (never >22 here)
 *     tx[3..3+length] = <payload>
 *
 * Reverse engineered from
 * `research/static-analysis/ghidra_out/firmware_handler.c`
 * (FUN_004065b0 — the top-level "flash firmware" handler; ~800 lines
 * of Ghidra decomp). The corresponding wire transmission sub-helpers
 * are FUN_00408220 (write) and FUN_004082f0 (read). Both send the
 * full 64-byte HID report every time; the dongle fills untransmitted
 * bytes with zero.
 *
 * State machine (per firmware_handler.c):
 *
 *   1. (optional) write 0x90 with param[2]=0  -- "enter flash mode"
 *      lock (only sent when vendor recognizes certain HID product
 *      names; we always send it to be safe).
 *   2. write 0x80  payload = { 0x01, 0x02, 0x03, 0x04 }
 *      read reply (6 bytes); reply[0] must be 0x56 ('V'). reply[1,3]
 *      encode the boot version (`V0x2y`); we treat anything other
 *      than `V02` as too-old and refuse to flash.
 *   3. write 0x83  payload = { 0xFF, 0x55, 0xAA, <19 random bytes> }
 *      read 1 byte (discarded) -- "cancel any previous flash".
 *   4. decrypt .sfw -> plaintext (see `sfw.ts`).
 *   5. generate 22 random bytes `challenge[0..21]`.
 *      write 0x81  payload = challenge.
 *      read 22 bytes `response`.
 *      compute `key[i] = challenge[i] ^ response[i]` for i=0..21.
 *      This XOR key is mixed into every subsequent 0x82 payload.
 *   6. verify `sfw.header.typeBytes` match the identify reply bytes
 *      (rx[4],rx[5] of the identify response — `abStack_1b4[4,5]`).
 *      The vendor exe shows "Error 1030" if they don't match.
 *   7. verify `sfw.header.modelId` equals the servo's current model id
 *      (from the `@0801SA33` line vs the config-block model id). The
 *      vendor exe shows "Error 1031" if they don't match.
 *   8. for each sector-erase line in order:
 *        buf[0] = 0x0A
 *        buf[1] = sector.bytes[0]
 *        buf[2] = sector.bytes[1]
 *        buf[3..21] = random
 *        buf[i] ^= key[i] for i in 0..21
 *        write 0x82 + 22-byte buf
 *        read 1 byte; must equal 0x55 or the erase failed.
 *   9. for each Intel HEX record in order:
 *        buf[0] = 0x3A                    (the `:` char)
 *        buf[1] = record.count
 *        buf[2] = (record.address >> 8) & 0xff
 *        buf[3] = record.address & 0xff
 *        buf[4] = record.type
 *        buf[5..5+count-1] = record.data
 *        buf[5+count] = record.checksum
 *        buf[(5+count+1)..21] = random
 *        capture `expectedReply = buf[5+count]` BEFORE XOR (i.e. the
 *          record's checksum byte)
 *        buf[i] ^= key[i] for i in 0..21
 *        write 0x82 + 22-byte buf
 *        read 1 byte; must equal `expectedReply`.
 *  10. after the `:00000001FF` EOF record has been sent successfully:
 *        write 0x83 payload = { 0xFF, 0x55, 0xAA, <19 bytes> } again
 *        read 1 byte (discarded) -- "flash complete; re-enter normal
 *        operation".
 *  11. (optional) write 0x90 with param[2]=1 -- "exit flash mode"
 *        (the mirror of step 1; only when vendor code path is active).
 *
 * Chunk transfer rate: the parameter-write helper at FUN_00404900
 * caps chunks at 59 bytes with a 25 ms inter-chunk sleep. The flash
 * commands all fit in a single 22-byte payload, so this module only
 * needs the 25 ms inter-command sleep to avoid overrunning the
 * dongle's HID input queue. That matches the `Sleep(0x19)` at the
 * top of FUN_00404900.
 */

import { randomBytes } from "node:crypto";
import { AxonError } from "../errors.ts";
import type { DecryptedSfw, IntelHexRecord } from "../sfw.ts";
import { REPORT_SIZE } from "./hid.ts";
import type { DongleHandle } from "./transport.ts";

// ---- flash command bytes --------------------------------------------------

/** "Enter/exit flash mode" — only sent when the dongle's HID product
 * name matches the vendor's hard-coded whitelist. We always send it
 * defensively; the dongle ignores it in the non-whitelist path. */
export const CMD_MODE_LOCK = 0x90;
/** Query bootloader version. */
export const CMD_BOOT_QUERY = 0x80;
/** Challenge / key exchange: host sends 22-byte challenge, dongle
 * returns 22-byte response; XOR is the per-session key. */
export const CMD_KEY_EXCHANGE = 0x81;
/** Sector erase / hex record write — payload is XOR-encrypted. */
export const CMD_DATA_WRITE = 0x82;
/** Flash session start / stop marker (`FF 55 AA ...`). */
export const CMD_FLASH_MARKER = 0x83;

/** Payload prefix for a sector-erase 0x82 command. */
export const DATA_PREFIX_SECTOR_ERASE = 0x0a;
/** Payload prefix for a hex-record 0x82 command: ASCII `:` char. */
export const DATA_PREFIX_HEX_RECORD = 0x3a;

/** Size of every 0x82 payload (and the 0x81 challenge). */
export const FLASH_PAYLOAD_SIZE = 22; // 0x16

/** Inter-command sleep. Matches Sleep(0x19) = 25 ms in the decomp. */
export const FLASH_CMD_SLEEP_MS = 25;

/** Report id used for all dongle HID transfers. */
const REPORT_ID = 0x04;

// ---- progress callback ----------------------------------------------------

export type FlashPhase =
  | "prepare"
  | "boot_query"
  | "cancel"
  | "key_exchange"
  | "verify_model"
  | "erase"
  | "write"
  | "finalize"
  | "done";

export interface FlashProgressEvent {
  phase: FlashPhase;
  /** Bytes of the decrypted firmware flashed so far (erase + write). */
  bytesSent?: number;
  /** Total bytes of the decrypted firmware that will be flashed. */
  bytesTotal?: number;
  /** Number of records processed so far (sector erases + hex records). */
  recordsSent?: number;
  /** Total number of records that will be processed. */
  recordsTotal?: number;
  /** Human-readable status line. */
  message?: string;
}

export type FlashProgressFn = (event: FlashProgressEvent) => void;

// ---- low-level helpers ----------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the 64-byte HID OUT report used by the flash command family.
 * Layout: `04 <cmd> <len> <payload..>` with zero padding to
 * REPORT_SIZE. The flash-family layout is different from the config
 * read/write command family in `protocol.ts`: here there are no
 * address bytes.
 */
export function buildFlashTx(cmd: number, payload: Uint8Array): Buffer {
  if (payload.length > REPORT_SIZE - 3) {
    throw new Error(`flash: payload is ${payload.length} bytes, max ${REPORT_SIZE - 3}`);
  }
  const tx = Buffer.alloc(REPORT_SIZE);
  tx[0] = REPORT_ID;
  tx[1] = cmd;
  tx[2] = payload.length;
  for (let i = 0; i < payload.length; i++) {
    tx[3 + i] = payload[i]!;
  }
  return tx;
}

/**
 * Parse a flash-family HID IN report. The dongle echoes the tx
 * layout: `04 <status> <length> <data..>`. The vendor exe's read
 * helper (FUN_004082f0) gates on `status != 0` AND `length == 0`
 * before pulling data out of `rx[5..]`. (The "length" byte here is
 * NOT a payload length — it's an error/flag byte, and on a
 * successful read it is zero; the actual data lives at rx[5..5+N]
 * where N is the count requested by the caller.)
 */
export function parseFlashRx(rx: Buffer, expectLength: number): Buffer {
  if (rx.length < 5 + expectLength) {
    throw AxonError.servoIo(`flash: rx is ${rx.length} bytes, need >= ${5 + expectLength}`);
  }
  if (rx[1] === 0) {
    throw AxonError.servoIo(
      `flash: status byte is 0 (expected non-zero). rx[2]=0x${rx[2]!.toString(16).padStart(2, "0")}`,
    );
  }
  if (rx[2] !== 0) {
    throw AxonError.servoIo(
      `flash: length-field is 0x${rx[2]!.toString(16).padStart(2, "0")} (expected 0). Dongle rejected the command.`,
    );
  }
  return rx.subarray(5, 5 + expectLength);
}

/**
 * Send one flash-family command and read the reply. Expects a
 * reply of `expectLength` bytes (up to 59); 0 is valid for
 * fire-and-forget commands that still require a drain-read to keep
 * the HID input queue in sync.
 */
async function exchange(
  handle: DongleHandle,
  cmd: number,
  payload: Uint8Array,
  expectLength: number,
  sleepMs: number,
): Promise<Buffer> {
  if (sleepMs > 0) await sleep(sleepMs);
  const tx = buildFlashTx(cmd, payload);
  await handle.write(tx);
  const rx = await handle.read();
  return parseFlashRx(rx, expectLength);
}

/**
 * Fill the tail of a payload buffer with random bytes, starting at
 * offset `fromIndex`. Matches the FUN_00408164 call in the decomp,
 * where the vendor exe fills unused slots with random noise so the
 * on-wire traffic doesn't leak patterns.
 */
function fillRandom(buf: Buffer, fromIndex: number): void {
  if (fromIndex >= buf.length) return;
  const rnd = randomBytes(buf.length - fromIndex);
  rnd.copy(buf, fromIndex);
}

/** XOR-encrypt a 22-byte payload in place against the session key. */
function xorInPlace(buf: Buffer, key: Uint8Array): void {
  if (buf.length !== key.length) {
    throw new Error(`flash: xor buffer/key length mismatch (${buf.length} vs ${key.length})`);
  }
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! ^ key[i]!;
}

// ---- the three payload shapes ---------------------------------------------

/** Build the (plaintext) 22-byte sector-erase command buffer. */
export function buildSectorEraseBuf(sectorBytes: [number, number]): Buffer {
  const buf = Buffer.alloc(FLASH_PAYLOAD_SIZE);
  buf[0] = DATA_PREFIX_SECTOR_ERASE;
  buf[1] = sectorBytes[0]! & 0xff;
  buf[2] = sectorBytes[1]! & 0xff;
  fillRandom(buf, 3);
  return buf;
}

/**
 * Build the (plaintext) 22-byte hex-record command buffer. Returns
 * both the buffer and the "expected reply" byte (the record's Intel
 * HEX checksum, which the dongle echoes back after a successful
 * write). The caller XOR-encrypts before writing; the expected reply
 * is captured BEFORE the XOR so the caller can compare it against
 * the raw byte the dongle returns.
 */
export function buildHexRecordBuf(record: IntelHexRecord): {
  buf: Buffer;
  expectedReply: number;
} {
  // count + 2 addr + 1 type + count data + 1 checksum = count + 5 bytes
  // after the leading ':' prefix. All of this must fit in 22 bytes
  // including the prefix, so count + 5 + 1 <= 22 → count <= 16.
  const total = record.count + 5 + 1; // +1 for the ':' prefix byte
  if (total > FLASH_PAYLOAD_SIZE) {
    throw new Error(
      `flash: hex record has count=${record.count} (total ${total}) exceeds ${FLASH_PAYLOAD_SIZE}-byte payload`,
    );
  }
  const buf = Buffer.alloc(FLASH_PAYLOAD_SIZE);
  buf[0] = DATA_PREFIX_HEX_RECORD;
  buf[1] = record.count & 0xff;
  buf[2] = (record.address >> 8) & 0xff;
  buf[3] = record.address & 0xff;
  buf[4] = record.type & 0xff;
  for (let i = 0; i < record.count; i++) {
    buf[5 + i] = record.data[i]!;
  }
  buf[5 + record.count] = record.checksum & 0xff;
  fillRandom(buf, 5 + record.count + 1);
  return { buf, expectedReply: record.checksum & 0xff };
}

// ---- top-level flasher ----------------------------------------------------

export interface FlashOptions {
  /** Optional per-record progress callback. */
  onProgress?: FlashProgressFn;
  /**
   * Connected servo's model id (from the config block at 0x40..0x47).
   * Cross-checked against `sfw.header.modelId`. The vendor exe shows
   * "Error 1031 Firmware is incorrect" if these don't match.
   */
  expectedModelId?: string;
  /**
   * If set, skip the boot-query → @0801 header cross-check even when
   * the bytes don't match. Only used by tests that fake the boot
   * reply; production callers should leave this false.
   */
  skipTypeCheck?: boolean;
  /**
   * Override the per-command inter-chunk sleep (ms). Defaults to
   * `FLASH_CMD_SLEEP_MS` = 25 ms to match the vendor exe. Tests
   * override this to 0 for fast execution.
   */
  cmdSleepMs?: number;
}

/**
 * Flash the given decrypted firmware to the dongle/servo. The
 * happy-path return is `void`; on any failure an `AxonError` is
 * thrown describing the phase that failed. Progress events are
 * emitted via `options.onProgress` if supplied.
 *
 * IMPORTANT: this function assumes the caller has already obtained
 * exclusive ownership of the dongle handle. It performs no
 * additional locking or re-identification — callers should run
 * `identify()` before and after this function to observe the mode
 * transition.
 */
export async function flashFirmware(
  handle: DongleHandle,
  firmware: DecryptedSfw,
  options: FlashOptions = {},
): Promise<void> {
  const progress = options.onProgress ?? (() => {});

  // Phase 1: model-id pre-check. Purely a client-side sanity check;
  // the dongle's own check happens in phase 6.
  if (options.expectedModelId !== undefined) {
    const rawModel = firmware.header.modelId;
    const cleanFirmware = rawModel.replace(/[*\0\s]+$/, "");
    const cleanExpected = options.expectedModelId.replace(/[*\0\s]+$/, "");
    if (cleanFirmware !== cleanExpected) {
      throw AxonError.validation(
        `firmware is for model "${rawModel}" but connected servo is "${options.expectedModelId}".`,
      );
    }
  }
  const sleepMs = options.cmdSleepMs ?? FLASH_CMD_SLEEP_MS;

  progress({ phase: "prepare", message: "Preparing flash session..." });

  // Phase 1b: enter flash mode (0x90 param=0). The vendor exe sends
  // this when the HID product name matches its whitelist — which our
  // dongle ("USBBootloader V1.3") does. Without this command the
  // servo stays in normal mode and rejects the key exchange (0x81).
  //
  // IMPORTANT: 0x90 has a DIFFERENT wire layout than the other flash
  // commands. The vendor writes directly to the HID buffer
  // (firmware_handler.c:164-168), NOT through FUN_00408220. The
  // param goes at tx[2] — there is no length field:
  //
  //   tx[0] = 0x04  (report ID)
  //   tx[1] = 0x90  (command)
  //   tx[2] = 0x00  (param: 0=enter, 1=exit)
  //   tx[3..63] = 0x00
  //
  // Do NOT use buildFlashTx here — it puts a length byte at tx[2].
  {
    const modeLockTx = Buffer.alloc(REPORT_SIZE);
    modeLockTx[0] = REPORT_ID;
    modeLockTx[1] = CMD_MODE_LOCK;
    modeLockTx[2] = 0x00; // enter flash mode
    await handle.write(modeLockTx);
    await handle.read(); // drain reply (content ignored by vendor)
  }

  // Phase 2: boot version query (0x80 + 4-byte payload 01 02 03 04).
  // The vendor exe has a Sleep(5) between write and read here
  // (firmware_handler.c:182). We match that with a post-write delay
  // to give the dongle time to prepare the boot version reply.
  progress({ phase: "boot_query", message: "Querying bootloader version..." });
  {
    const bootTx = buildFlashTx(CMD_BOOT_QUERY, Uint8Array.from([0x01, 0x02, 0x03, 0x04]));
    if (sleepMs > 0) await sleep(sleepMs);
    await handle.write(bootTx);
    await sleep(5); // vendor exe: Sleep(5) between write and read
  }
  const bootReply = parseFlashRx(await handle.read(), 6);
  if (bootReply[0] !== 0x56) {
    throw AxonError.servoIo(
      `flash: boot query reply[0]=0x${bootReply[0]!.toString(16)} (expected 0x56 'V')`,
    );
  }
  // The vendor exe refuses when (reply[3]=='2' && reply[1]=='0'): ASCII
  // "V02" which is exactly the "Boot Version too old" guard. In
  // practice every servo we've seen ships with a newer bootloader,
  // but mirror the guard so an unexpected old device is rejected.
  if (bootReply[1] === 0x30 && bootReply[3] === 0x32) {
    throw AxonError.servoIo("flash: bootloader reports version V02, which is too old to flash.");
  }

  // Cross-check the .sfw header's type bytes against the boot-query
  // reply. The vendor exe stashes `bootReply[4]` and `bootReply[5]`
  // into _DAT_007c51e9 and _DAT_007c51ea at firmware_handler.c lines
  // 193-194, then compares them against the two hex-byte literals in
  // the @0801XY header line after decrypting. This is the "Error
  // 1030 Firmware is incorrect" guard at lines 403-404, and it's the
  // ONLY wire-level "is this firmware for this servo family" check.
  const [fa, fb] = firmware.header.typeBytes;
  const ra = bootReply[4]!;
  const rb = bootReply[5]!;
  if (!options.skipTypeCheck && (fa !== ra || fb !== rb)) {
    throw AxonError.validation(
      `flash: firmware type bytes are [0x${fa.toString(16).padStart(2, "0")}, ` +
        `0x${fb.toString(16).padStart(2, "0")}] but boot reply reported ` +
        `[0x${ra.toString(16).padStart(2, "0")}, 0x${rb.toString(16).padStart(2, "0")}]. ` +
        `Wrong family of firmware for this servo.`,
    );
  }

  // Phase 3: "cancel any previous flash" (0x83 FF 55 AA …).
  progress({ phase: "cancel", message: "Cancelling any previous flash session..." });
  const cancelBuf = Buffer.alloc(FLASH_PAYLOAD_SIZE);
  cancelBuf[0] = 0xff;
  cancelBuf[1] = 0x55;
  cancelBuf[2] = 0xaa;
  fillRandom(cancelBuf, 3);
  // Expected reply is 1 byte of any value; swallow it to keep the
  // HID input queue drained.
  await exchange(handle, CMD_FLASH_MARKER, cancelBuf, 1, sleepMs);

  // Phase 4: key exchange (0x81 + 22 random bytes).
  progress({ phase: "key_exchange", message: "Negotiating flash session key..." });
  const challenge = randomBytes(FLASH_PAYLOAD_SIZE);
  const response = await exchange(handle, CMD_KEY_EXCHANGE, challenge, FLASH_PAYLOAD_SIZE, sleepMs);
  const key = Buffer.alloc(FLASH_PAYLOAD_SIZE);
  for (let i = 0; i < FLASH_PAYLOAD_SIZE; i++) {
    key[i] = challenge[i]! ^ response[i]!;
  }

  progress({ phase: "verify_model", message: "Verifying firmware matches servo..." });
  // The vendor exe runs the @0801 header check here as a
  // post-key-exchange gate. Our decrypt already surfaced the header,
  // and we've cross-checked the caller-supplied expected id in
  // phase 1, so there's nothing else to do here besides emitting the
  // progress event.

  // Compute totals so the caller can render a progress bar.
  const totalRecords = firmware.sectorErases.length + firmware.hexRecords.length;
  const totalBytes = firmware.hexRecords.reduce((acc, r) => acc + r.count, 0);
  let doneRecords = 0;
  let doneBytes = 0;

  // Phase 5: sector erases.
  for (const sector of firmware.sectorErases) {
    const buf = buildSectorEraseBuf(sector.bytes);
    xorInPlace(buf, key);
    const reply = await exchange(handle, CMD_DATA_WRITE, buf, 1, sleepMs);
    if (reply[0] !== 0x55) {
      throw AxonError.servoIo(
        `flash: sector erase $${sector.raw} failed: reply byte 0x${reply[0]!.toString(16)} (expected 0x55)`,
      );
    }
    doneRecords += 1;
    progress({
      phase: "erase",
      recordsSent: doneRecords,
      recordsTotal: totalRecords,
      bytesSent: doneBytes,
      bytesTotal: totalBytes,
      message: `Erased sector $${sector.raw}`,
    });
  }

  // Phase 6: hex records (including the EOF record).
  for (const rec of firmware.hexRecords) {
    const { buf, expectedReply } = buildHexRecordBuf(rec);
    xorInPlace(buf, key);
    const reply = await exchange(handle, CMD_DATA_WRITE, buf, 1, sleepMs);
    if (reply[0] !== expectedReply) {
      throw AxonError.servoIo(
        `flash: hex record addr=0x${rec.address.toString(16).padStart(4, "0")} ` +
          `type=0x${rec.type.toString(16).padStart(2, "0")} write failed: ` +
          `reply 0x${reply[0]!.toString(16)} != expected 0x${expectedReply.toString(16)}`,
      );
    }
    doneRecords += 1;
    doneBytes += rec.count;
    progress({
      phase: "write",
      recordsSent: doneRecords,
      recordsTotal: totalRecords,
      bytesSent: doneBytes,
      bytesTotal: totalBytes,
      message: `Wrote ${rec.count} bytes @ 0x${rec.address.toString(16).padStart(4, "0")}`,
    });
  }

  // Phase 7: finalize — same FF 55 AA marker as the "cancel" above.
  progress({ phase: "finalize", message: "Finalizing flash session..." });
  const finishBuf = Buffer.alloc(FLASH_PAYLOAD_SIZE);
  finishBuf[0] = 0xff;
  finishBuf[1] = 0x55;
  finishBuf[2] = 0xaa;
  fillRandom(finishBuf, 3);
  await exchange(handle, CMD_FLASH_MARKER, finishBuf, 1, sleepMs);

  // Phase 8: exit flash mode (0x90 param=1). Same direct layout as
  // the enter in phase 1b (firmware_handler.c:717-723).
  {
    const modeUnlockTx = Buffer.alloc(REPORT_SIZE);
    modeUnlockTx[0] = REPORT_ID;
    modeUnlockTx[1] = CMD_MODE_LOCK;
    modeUnlockTx[2] = 0x01; // exit flash mode
    await handle.write(modeUnlockTx);
    await handle.read(); // drain reply
  }

  progress({
    phase: "done",
    bytesSent: doneBytes,
    bytesTotal: totalBytes,
    message: "Flash complete.",
  });
}
