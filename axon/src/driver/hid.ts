/**
 * Production HID transport for the Axon dongle via node-hid.
 *
 * Implements the abstract `DongleHandle` interface from
 * `transport.ts`. The protocol layer in `protocol.ts` only sees the
 * abstract interface — it has no compile-time dependency on
 * `node-hid`. Tests inject a `MockDongle` instead.
 *
 * This module replaces an earlier libusb-based driver that required
 * `sudo` on macOS to claim HID-class interfaces. node-hid goes
 * through the OS's HID framework (IOKit HID Manager on macOS,
 * hidraw on Linux, HID.dll on Windows) and does NOT need elevated
 * privileges on any platform.
 *
 * IMPORTANT: the dongle has a state machine that can be put into a
 * "cold" mode by a USB bus reset. node-hid does not expose any
 * primitive that can do this — we're safe by construction. The risk
 * was a libusb-era footgun.
 */

import HID from "node-hid";
import { AxonError } from "../errors.ts";
import type { DongleHandle } from "./transport.ts";

export const VID = 0x0471;
export const PID = 0x13aa;
export const REPORT_SIZE = 64;

/**
 * Cheap "is there a dongle plugged in" check. Enumerates HID devices
 * and filters by VID/PID. Does NOT open the device — safe to call
 * from `axon status` and `axon monitor`'s "not-yet-opened" state.
 */
export function isDonglePresent(): boolean {
  const matches = HID.devices(VID, PID);
  return matches.length > 0;
}

/**
 * Concrete `DongleHandle` implementation backed by a node-hid
 * `HID.HID` instance. Internal — instances are produced by
 * `openDongle()`.
 */
class NodeHidDongle implements DongleHandle {
  private device: HID.HID;
  private released = false;

  constructor(device: HID.HID) {
    this.device = device;
  }

  write(data: Buffer, _timeoutMs = 500): Promise<void> {
    if (this.released) {
      return Promise.reject(new Error("write after release"));
    }
    if (data.length > REPORT_SIZE) {
      return Promise.reject(
        new Error(`hid write: data is ${data.length} bytes, max ${REPORT_SIZE}`),
      );
    }
    const padded = Buffer.alloc(REPORT_SIZE);
    data.copy(padded, 0);
    return new Promise<void>((resolve, reject) => {
      try {
        const n = this.device.write(Array.from(padded));
        if (n <= 0) {
          reject(new Error(`hid write returned ${n}`));
        } else {
          resolve();
        }
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  read(timeoutMs = 500): Promise<Buffer> {
    if (this.released) {
      return Promise.reject(new Error("read after release"));
    }
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const bytes = this.device.readTimeout(timeoutMs);
        if (!bytes || bytes.length === 0) {
          reject(new Error("hid read returned empty buffer (timeout?)"));
          return;
        }
        resolve(Buffer.from(bytes));
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    try {
      this.device.close();
    } catch {
      // best effort — node-hid occasionally throws on double-close
    }
  }
}

/**
 * Open the single Axon dongle. Enforces the "exactly one" invariant
 * from the CLI design spec — zero or more-than-one dongles yields
 * `ExitCode.DongleNotFound`.
 */
export async function openDongle(): Promise<DongleHandle> {
  const matches = HID.devices(VID, PID);
  if (matches.length === 0) {
    throw AxonError.dongleNotFound("Axon dongle not found on USB.");
  }
  if (matches.length > 1) {
    throw AxonError.dongleNotFound(
      `Found ${matches.length} Axon dongles on USB — expected exactly 1.`,
    );
  }

  const desc = matches[0]!;
  const path = desc.path;
  if (!path) {
    throw AxonError.dongleNotFound(
      "Axon dongle enumerated but no device path (node-hid returned an entry without `path`).",
    );
  }

  let device: HID.HID;
  try {
    device = new HID.HID(path);
  } catch (e) {
    throw AxonError.dongleNotFound(
      `failed to open Axon dongle at ${path}: ${(e as Error).message}`,
    );
  }

  return new NodeHidDongle(device);
}
