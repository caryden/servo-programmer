import { createHash } from "node:crypto";

export * from "@axon/core/sfw";

/** Compute the SHA-256 hash of a .sfw file as a lowercase hex string. */
export function sfwHashHex(ciphertext: Buffer): string {
  return createHash("sha256").update(ciphertext).digest("hex");
}

/** Compare a .sfw file's SHA-256 against a known-good hex digest. */
export function verifySfwHash(ciphertext: Buffer, expectedSha256: string): boolean {
  const actual = sfwHashHex(ciphertext);
  return actual.toLowerCase() === expectedSha256.toLowerCase();
}
