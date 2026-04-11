/**
 * .sfw firmware container — decrypt + Intel HEX parse.
 *
 * TypeScript port of `research/static-analysis/static_analyze.py`'s
 * `cmd_decrypt`, cross-checked against
 * `research/decrypted-firmware/Axon_Mini_Servo_Mode.plain.bin` as
 * ground truth.
 *
 * File layout (reverse engineered from the vendor exe):
 *
 *   bytes[0:16]   AES-128-ECB(key="TTTTTTTTTTTTTTTT")
 *                 -> [uint32_le declared_length][12 x 'x' magic]
 *   bytes[16:]    AES-128-CBC(key, iv=0)
 *                 -> plaintext[0:declared_length] is ASCII text:
 *                      line 1   `@0801<8-char model id>`
 *                      N lines  `$<4-hex-char sector addr>`  (sector erase)
 *                      M lines  `:<Intel HEX record>`
 *                      last     `:00000001FF` (Intel HEX EOF)
 *                    The remaining bytes are AES block padding — not
 *                    part of the firmware.
 *
 * The lines are CRLF-terminated in the ground-truth files, but we
 * tolerate both line endings on parse.
 */

import { createDecipheriv, createHash } from "node:crypto";

/** AES-128 key used for every .sfw file: sixteen ASCII 'T' bytes. */
const KEY = Buffer.from("TTTTTTTTTTTTTTTT", "ascii");
const IV_ZERO = Buffer.alloc(16, 0);

/** Expected magic run in the 16-byte ECB header: twelve ASCII 'x' bytes. */
const MAGIC = Buffer.from("xxxxxxxxxxxx", "ascii");

export interface IntelHexRecord {
  /** Byte count field (COUNT in `:CCAAAATT...`). */
  count: number;
  /** 16-bit address field. */
  address: number;
  /** Record type: 0x00 = data, 0x01 = EOF. */
  type: number;
  /** Decoded data payload (`count` bytes). */
  data: Buffer;
  /** Stored checksum byte (last byte of the record). */
  checksum: number;
  /** The original ASCII line (without the leading `:` or trailing CRLF). */
  raw: string;
}

export interface SectorEraseRecord {
  /** Raw line text without leading `$` or trailing CRLF. */
  raw: string;
  /** Two sector bytes parsed from positions 1..2 and 3..4 of the line. */
  bytes: [number, number];
}

export interface SfwHeaderRecord {
  /** Raw line text without leading `@` or trailing CRLF. */
  raw: string;
  /**
   * Two servo-type bytes parsed from positions 1..2 and 3..4 of the
   * line (`0801` → [0x08, 0x01]). The vendor exe compares these
   * against the identify reply's model bytes before flashing.
   */
  typeBytes: [number, number];
  /** Model id string starting at position 5 (e.g. "SA33****"). */
  modelId: string;
}

export interface DecryptedSfw {
  /** Length declared by the 16-byte header. */
  declaredLength: number;
  /**
   * The full decrypted plaintext bytes (trimmed to declaredLength).
   * Byte-for-byte comparable with the ground-truth
   * `research/decrypted-firmware/*.plain.bin` files.
   */
  plaintext: Buffer;
  /** The single `@0801<model>` handshake line. */
  header: SfwHeaderRecord;
  /** All `$HHHH` sector-erase lines, in file order. */
  sectorErases: SectorEraseRecord[];
  /** All `:...` Intel HEX records, in file order, terminated by a 0x01 EOF record. */
  hexRecords: IntelHexRecord[];
}

function ensureAligned(ciphertext: Buffer): void {
  if (ciphertext.length < 32 || ciphertext.length % 16 !== 0) {
    throw new Error(
      `sfw: ciphertext is ${ciphertext.length} bytes; expected >=32 and a multiple of 16`,
    );
  }
}

function decryptEcb16(block: Buffer): Buffer {
  const decipher = createDecipheriv("aes-128-ecb", KEY, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(block), decipher.final()]);
}

function decryptCbc(body: Buffer): Buffer {
  const decipher = createDecipheriv("aes-128-cbc", KEY, IV_ZERO);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/**
 * Parse a single hex byte pair (e.g. "A3") into a number 0..255.
 * Throws on non-hex input.
 */
function hexByte(s: string, where: string): number {
  if (s.length !== 2) {
    throw new Error(`sfw: ${where}: expected 2 hex chars, got "${s}"`);
  }
  const v = Number.parseInt(s, 16);
  if (Number.isNaN(v) || v < 0 || v > 0xff) {
    throw new Error(`sfw: ${where}: not a hex byte: "${s}"`);
  }
  return v;
}

/**
 * Parse a single Intel HEX record. The input is the line body WITHOUT
 * the leading `:` and WITHOUT the trailing CR/LF. Validates the
 * checksum against `(0x100 - (sum of all bytes)) & 0xFF`.
 */
export function parseIntelHexRecord(body: string): IntelHexRecord {
  if (body.length < 10 || body.length % 2 !== 0) {
    throw new Error(`sfw: hex record "${body}" has invalid length ${body.length}`);
  }
  const count = hexByte(body.slice(0, 2), "hex record count");
  const addrHi = hexByte(body.slice(2, 4), "hex record addr-hi");
  const addrLo = hexByte(body.slice(4, 6), "hex record addr-lo");
  const type = hexByte(body.slice(6, 8), "hex record type");
  // Expected total hex pairs = 1 count + 2 addr + 1 type + count data + 1 checksum
  const expectedPairs = 1 + 2 + 1 + count + 1;
  if (body.length !== expectedPairs * 2) {
    throw new Error(
      `sfw: hex record "${body}" has count=${count} but ${body.length / 2} bytes (expected ${expectedPairs})`,
    );
  }
  const data = Buffer.alloc(count);
  for (let i = 0; i < count; i++) {
    data[i] = hexByte(body.slice(8 + i * 2, 10 + i * 2), `hex record data[${i}]`);
  }
  const checksum = hexByte(body.slice(8 + count * 2, 10 + count * 2), "hex record checksum");
  // Verify.
  let sum = count + addrHi + addrLo + type;
  for (let i = 0; i < count; i++) sum += data[i] ?? 0;
  const expected = (0x100 - (sum & 0xff)) & 0xff;
  if (expected !== checksum) {
    throw new Error(
      `sfw: hex record "${body}" checksum mismatch: stored 0x${checksum.toString(16)} != computed 0x${expected.toString(16)}`,
    );
  }
  return {
    count,
    address: (addrHi << 8) | addrLo,
    type,
    data,
    checksum,
    raw: body,
  };
}

/** Compute the Intel HEX checksum byte for a record body (excluding `:`). */
export function intelHexChecksum(bytes: readonly number[] | Buffer): number {
  let sum = 0;
  for (const b of bytes) sum = (sum + (b & 0xff)) & 0xff;
  return (0x100 - sum) & 0xff;
}

/**
 * Split the plaintext into lines, tolerant of CRLF / LF. Empty
 * trailing lines (common after the last CRLF) are dropped.
 */
function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Decrypt a .sfw blob and parse the resulting plaintext into
 * structured records. Throws on anything abnormal (wrong magic, bad
 * checksum, unexpected line prefix, missing EOF record, or non-empty
 * data after EOF). Deliberately strict — a silent-failure decrypter
 * would put us in a bad spot the first time we flash real hardware.
 */
export function decryptSfw(ciphertext: Buffer): DecryptedSfw {
  ensureAligned(ciphertext);

  const header = decryptEcb16(ciphertext.subarray(0, 16));
  const declaredLength = header.readUInt32LE(0);
  const magic = header.subarray(4, 16);
  if (!magic.equals(MAGIC)) {
    throw new Error(
      `sfw: header magic is ${magic.toString("hex")}, expected ${MAGIC.toString("hex")}`,
    );
  }
  if (declaredLength <= 0 || declaredLength > ciphertext.length) {
    throw new Error(
      `sfw: declared length ${declaredLength} is out of range (file is ${ciphertext.length} bytes)`,
    );
  }

  const body = ciphertext.subarray(16);
  const rawPlaintext = decryptCbc(body);
  const plaintext = rawPlaintext.subarray(0, declaredLength);

  // Intel HEX + sector directives are ASCII; the rest is padding.
  const text = plaintext.toString("ascii");
  const lines = splitLines(text);
  if (lines.length === 0) {
    throw new Error("sfw: plaintext had no lines");
  }

  // Line 1: @0801<model>
  const first = lines[0];
  if (first === undefined) {
    throw new Error("sfw: plaintext had no lines");
  }
  if (!first.startsWith("@")) {
    throw new Error(`sfw: expected first line to start with '@', got "${first.slice(0, 16)}"`);
  }
  if (first.length < 5) {
    throw new Error(`sfw: header line "${first}" is too short`);
  }
  const headerRec: SfwHeaderRecord = {
    raw: first.slice(1),
    typeBytes: [
      hexByte(first.slice(1, 3), "sfw header typeByte[0]"),
      hexByte(first.slice(3, 5), "sfw header typeByte[1]"),
    ],
    modelId: first.slice(5),
  };

  const sectorErases: SectorEraseRecord[] = [];
  const hexRecords: IntelHexRecord[] = [];
  let sawEof = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.length === 0) continue;
    if (sawEof) {
      throw new Error(`sfw: non-empty line after Intel HEX EOF at line ${i + 1}`);
    }
    if (line.startsWith("$")) {
      if (line.length < 5) {
        throw new Error(`sfw: sector line "${line}" is too short`);
      }
      sectorErases.push({
        raw: line.slice(1),
        bytes: [
          hexByte(line.slice(1, 3), "sector byte[0]"),
          hexByte(line.slice(3, 5), "sector byte[1]"),
        ],
      });
    } else if (line.startsWith(":")) {
      const rec = parseIntelHexRecord(line.slice(1));
      hexRecords.push(rec);
      if (rec.type === 0x01) sawEof = true;
    } else {
      throw new Error(
        `sfw: unknown line prefix at line ${i + 1}: "${line.slice(0, 32)}" (expected '$' or ':')`,
      );
    }
  }
  if (!sawEof) {
    throw new Error("sfw: plaintext has no Intel HEX EOF record (:00000001FF)");
  }

  return {
    declaredLength,
    plaintext,
    header: headerRec,
    sectorErases,
    hexRecords,
  };
}

/** Compute the SHA-256 hash of a .sfw file as a lowercase hex string. */
export function sfwHashHex(ciphertext: Buffer): string {
  return createHash("sha256").update(ciphertext).digest("hex");
}

/** Compare a .sfw file's SHA-256 against a known-good hex digest. */
export function verifySfwHash(ciphertext: Buffer, expectedSha256: string): boolean {
  const actual = sfwHashHex(ciphertext);
  return actual.toLowerCase() === expectedSha256.toLowerCase();
}
