import { createHash } from "node:crypto";
import { toUint8Array } from "./util/bytes.ts";

export * from "@axon/core/sfw";

/** Compute the SHA-256 hash of a .sfw file as a lowercase hex string. */
export function sfwHashHex(ciphertext: ArrayLike<number>): string {
  return createHash("sha256").update(toUint8Array(ciphertext)).digest("hex");
}

/** Compare a .sfw file's SHA-256 against a known-good hex digest. */
export function verifySfwHash(ciphertext: ArrayLike<number>, expectedSha256: string): boolean {
  const actual = sfwHashHex(ciphertext);
  return actual.toLowerCase() === expectedSha256.toLowerCase();
}
