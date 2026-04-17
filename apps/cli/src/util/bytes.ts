import { Buffer } from "node:buffer";

export function toUint8Array(bytes: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes);
}

export function cloneBuffer(bytes: ArrayLike<number>): Buffer {
  return Buffer.from(toUint8Array(bytes));
}
