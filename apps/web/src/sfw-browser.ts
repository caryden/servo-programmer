import { Buffer } from "node:buffer";
import type {
  DecryptedSfw,
  IntelHexRecord,
  SectorEraseRecord,
  SfwHeaderRecord,
} from "@axon/core/sfw";
import * as aesjs from "aes-js";

const KEY = aesjs.utils.utf8.toBytes("TTTTTTTTTTTTTTTT");
const IV_ZERO = new Uint8Array(16);
const MAGIC = Buffer.from("xxxxxxxxxxxx", "ascii");
const MIN_SFW_BYTES = 32;

function ensureAligned(ciphertext: Uint8Array): void {
  if (ciphertext.length < MIN_SFW_BYTES || ciphertext.length % 16 !== 0) {
    throw new Error(
      `sfw: ciphertext is ${ciphertext.length} bytes; expected >=${MIN_SFW_BYTES} and a multiple of 16`,
    );
  }
}

function decryptEcb16(block: Uint8Array): Buffer {
  const mode = new aesjs.ModeOfOperation.ecb(KEY);
  return Buffer.from(mode.decrypt(block));
}

function decryptCbc(body: Uint8Array): Buffer {
  const mode = new aesjs.ModeOfOperation.cbc(KEY, IV_ZERO);
  return Buffer.from(mode.decrypt(body));
}

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

function parseIntelHexRecord(body: string): IntelHexRecord {
  if (body.length < 10 || body.length % 2 !== 0) {
    throw new Error(`sfw: hex record "${body}" has invalid length ${body.length}`);
  }
  const count = hexByte(body.slice(0, 2), "hex record count");
  const addrHi = hexByte(body.slice(2, 4), "hex record addr-hi");
  const addrLo = hexByte(body.slice(4, 6), "hex record addr-lo");
  const type = hexByte(body.slice(6, 8), "hex record type");
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

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function decryptSfwBrowser(ciphertext: Uint8Array): DecryptedSfw {
  ensureAligned(ciphertext);

  const header = decryptEcb16(ciphertext.subarray(0, 16));
  const declaredLength = header.readUInt32LE(0);
  const magic = header.subarray(4, 16);
  if (magic.toString("hex") !== MAGIC.toString("hex")) {
    throw new Error(
      `sfw: header magic is ${magic.toString("hex")}, expected ${MAGIC.toString("hex")}`,
    );
  }
  if (declaredLength <= 0 || declaredLength > ciphertext.length) {
    throw new Error(
      `sfw: declared length ${declaredLength} is out of range (file is ${ciphertext.length} bytes)`,
    );
  }

  const rawPlaintext = decryptCbc(Uint8Array.from(ciphertext.subarray(16)));
  const plaintext = rawPlaintext.subarray(0, declaredLength);
  const text = plaintext.toString("ascii");
  const lines = splitLines(text);
  if (lines.length === 0) {
    throw new Error("sfw: plaintext had no lines");
  }

  const first = lines[0];
  if (!first?.startsWith("@")) {
    throw new Error(
      `sfw: expected first line to start with '@', got "${first?.slice(0, 16) ?? ""}"`,
    );
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
