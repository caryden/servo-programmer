/**
 * Unit tests for `axon/src/sfw.ts`. Ground truth comes from the
 * Python `research/static-analysis/static_analyze.py decrypt`
 * command, and is frozen in `research/decrypted-firmware/*.plain.bin`
 * (CRLF-terminated ASCII). If these tests fail, the .sfw decrypter
 * is no longer byte-compatible with the vendor exe and flashing
 * would brick hardware.
 */

import { describe, expect, test } from "bun:test";
import { createCipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decryptSfw,
  intelHexChecksum,
  parseIntelHexRecord,
  sfwHashHex,
  verifySfwHash,
} from "../src/sfw.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");
const DOWNLOADS = join(REPO_ROOT, "downloads");
const GROUND_TRUTH = join(REPO_ROOT, "research/decrypted-firmware");

// Known-good files committed to the repo. If the download bundle is
// missing, these tests should still work from the ground-truth
// plaintexts — but `decryptSfw` needs the ciphertext, so we skip
// gracefully if downloads/ isn't populated on this machine.
const MINI_SERVO_CIPHER = join(DOWNLOADS, "Axon_Mini_Servo_Mode.sfw");
const MINI_SERVO_PLAIN = join(GROUND_TRUTH, "Axon_Mini_Servo_Mode.plain.bin");
const MINI_CR_CIPHER = join(DOWNLOADS, "Axon_Mini_Modified_CR_Mode.sfw");
const MINI_CR_PLAIN = join(GROUND_TRUTH, "Axon_Mini_Modified_CR_Mode.plain.bin");
const MAX_SERVO_CIPHER = join(DOWNLOADS, "Axon_Max_Servo_Mode.sfw");
const MAX_SERVO_PLAIN = join(GROUND_TRUTH, "Axon_Max_Servo_Mode.plain.bin");
const SFW_KEY = Buffer.from("TTTTTTTTTTTTTTTT", "ascii");

const KNOWN_HASHES: Record<string, string> = {
  [MINI_SERVO_CIPHER]: "c9f038a854629c1f237e5008c9444a829d2fe5744203bcc959c8fd0c2e95c2c3",
  [MINI_CR_CIPHER]: "684ba8d5f904b183e635469b6f55341b0bf7cb49546a6f069d59504cf9ae6380",
};

function tryRead(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

function encryptEcb16(block: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", SFW_KEY, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

function encryptCbc(body: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-cbc", SFW_KEY, Buffer.alloc(16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(body), cipher.final()]);
}

function encryptTestSfw(plaintext: string): Buffer {
  const body = Buffer.from(plaintext, "ascii");
  const paddedBody = Buffer.alloc(Math.ceil(body.length / 16) * 16);
  body.copy(paddedBody);

  const header = Buffer.alloc(16);
  header.writeUInt32LE(body.length, 0);
  header.fill(0x78, 4); // 'x' magic bytes

  return Buffer.concat([encryptEcb16(header), encryptCbc(paddedBody)]);
}

describe("sfw decrypt", () => {
  test("Axon_Mini_Servo_Mode matches ground-truth plaintext", () => {
    const ct = tryRead(MINI_SERVO_CIPHER);
    const expected = tryRead(MINI_SERVO_PLAIN);
    if (ct === null || expected === null) {
      // downloads/ is gitignored and may not exist on CI runners.
      return;
    }
    const dec = decryptSfw(ct);
    expect(dec.plaintext.equals(expected)).toBe(true);
    expect(dec.declaredLength).toBe(expected.length);
    expect(dec.header.raw).toBe("0801SA33");
    expect(dec.header.typeBytes).toEqual([0x08, 0x01]);
    expect(dec.header.modelId).toBe("SA33");
    expect(dec.sectorErases.length).toBe(13);
    expect(dec.hexRecords.length).toBe(401);
    // Last record must be the Intel HEX EOF.
    const last = dec.hexRecords.at(-1);
    expect(last).toBeDefined();
    expect(last?.type).toBe(0x01);
    expect(last?.count).toBe(0);
    expect(last?.checksum).toBe(0xff);
  });

  test("Axon_Mini_Modified_CR_Mode matches ground-truth plaintext", () => {
    const ct = tryRead(MINI_CR_CIPHER);
    const expected = tryRead(MINI_CR_PLAIN);
    if (ct === null || expected === null) return;
    const dec = decryptSfw(ct);
    expect(dec.plaintext.equals(expected)).toBe(true);
    expect(dec.header.modelId).toBe("SA33");
  });

  test("Axon_Max_Servo_Mode matches ground-truth plaintext", () => {
    const ct = tryRead(MAX_SERVO_CIPHER);
    const expected = tryRead(MAX_SERVO_PLAIN);
    if (ct === null || expected === null) return;
    const dec = decryptSfw(ct);
    expect(dec.plaintext.equals(expected)).toBe(true);
    // Max has a longer model id (SA81BHMW).
    expect(dec.header.modelId).toBe("SA81BHMW");
  });

  test("decryptSfw rejects short blobs", () => {
    expect(() => decryptSfw(Buffer.alloc(0))).toThrow(/not a valid|32|multiple/);
    expect(() => decryptSfw(Buffer.alloc(17))).toThrow(/multiple/);
  });

  test("decryptSfw rejects wrong header magic", () => {
    // Build a 32-byte blob with a plausible length but wrong magic:
    // encrypt [04 00 00 00, 'q' x 12] under the real key.
    const fakeHeader = Buffer.alloc(16);
    fakeHeader.writeUInt32LE(4, 0);
    fakeHeader.fill(0x71, 4); // 'q' bytes, not 'x'
    // Re-encrypt with the real key to get a ciphertext block that
    // will decrypt back to our bogus header.
    // (We just use a zero-body; decrypt will reject at the magic
    // check before touching it.)
    const encHeader = encryptEcb16(fakeHeader);
    const blob = Buffer.concat([encHeader, Buffer.alloc(16)]);
    expect(() => decryptSfw(blob)).toThrow(/magic/);
  });

  test("decryptSfw rejects non-empty lines after Intel HEX EOF", () => {
    const blob = encryptTestSfw("@0801SA33\r\n$0000\r\n:00000001FF\r\n:0000000000\r\n");

    expect(() => decryptSfw(blob)).toThrow(/after Intel HEX EOF/);
  });
});

describe("intel hex parser", () => {
  test("parses a known-good data record", () => {
    // A real record from the Mini Servo Mode firmware, taken from
    // the ground-truth plaintext: `101A9600F7FDFBFBFEFEFD00101020204040F7FE88`.
    const rec = parseIntelHexRecord("101A9600F7FDFBFBFEFEFD00101020204040F7FE88");
    expect(rec.count).toBe(0x10);
    expect(rec.address).toBe(0x1a96);
    expect(rec.type).toBe(0x00);
    expect(rec.data.length).toBe(16);
    expect(rec.data[0]).toBe(0xf7);
    expect(rec.checksum).toBe(0x88);
  });

  test("parses the Intel HEX EOF record", () => {
    const rec = parseIntelHexRecord("00000001FF");
    expect(rec.count).toBe(0);
    expect(rec.type).toBe(0x01);
    expect(rec.checksum).toBe(0xff);
    expect(rec.data.length).toBe(0);
  });

  test("rejects a record with wrong checksum", () => {
    // Same record as the first test but with the last byte flipped.
    expect(() => parseIntelHexRecord("101A9600F7FDFBFBFEFEFD00101020204040F7FE00")).toThrow(
      /checksum/,
    );
  });

  test("rejects a record with mismatched count field", () => {
    // count=5 but only 1 data byte present.
    expect(() => parseIntelHexRecord("05000000AA")).toThrow(/length|count/);
  });

  test("intelHexChecksum computes the standard algorithm", () => {
    // For :020000040008F2 (an extended-linear-address record),
    // checksum = (0x100 - (0x02+0x00+0x00+0x04+0x00+0x08)) & 0xff = 0xF2.
    expect(intelHexChecksum([0x02, 0x00, 0x00, 0x04, 0x00, 0x08])).toBe(0xf2);
  });
});

describe("sfw hash helpers", () => {
  test("sfwHashHex matches a known-good SHA-256", () => {
    const ct = tryRead(MINI_SERVO_CIPHER);
    if (ct === null) return;
    expect(sfwHashHex(ct)).toBe(KNOWN_HASHES[MINI_SERVO_CIPHER]);
  });

  test("verifySfwHash accepts the catalog hash", () => {
    const ct = tryRead(MINI_SERVO_CIPHER);
    const expected = KNOWN_HASHES[MINI_SERVO_CIPHER];
    if (ct === null || expected === undefined) return;
    expect(verifySfwHash(ct, expected)).toBe(true);
  });

  test("verifySfwHash rejects a wrong hash", () => {
    const ct = tryRead(MINI_SERVO_CIPHER);
    if (ct === null) return;
    expect(verifySfwHash(ct, "0".repeat(64))).toBe(false);
  });

  test("verifySfwHash is case-insensitive", () => {
    const ct = tryRead(MINI_SERVO_CIPHER);
    const expected = KNOWN_HASHES[MINI_SERVO_CIPHER];
    if (ct === null || expected === undefined) return;
    expect(verifySfwHash(ct, expected.toUpperCase())).toBe(true);
  });
});
