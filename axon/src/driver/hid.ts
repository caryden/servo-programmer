/**
 * HID transport for the Axon dongle via node-hid.
 *
 * This replaces an earlier libusb-based driver that required `sudo` on
 * macOS to claim HID-class interfaces. node-hid goes through the OS's
 * HID framework (IOKit HID Manager on macOS, hidraw on Linux, HID.dll
 * on Windows) and does NOT need elevated privileges on any platform.
 *
 * The protocol layer above (driver/protocol.ts) is transport-agnostic
 * and talks to this module through a `DongleHandle` abstraction, so
 * swapping the transport is purely mechanical.
 *
 * IMPORTANT: the dongle has a state machine that can be put into a
 * "cold" mode by a USB bus reset. Never issue one. `node-hid` does
 * not expose such a primitive, so we're safe here by construction —
 * the risk was a libusb-era footgun.
 */

import HID from "node-hid";
import { AxonError } from "../errors.ts";

export const VID = 0x0471;
export const PID = 0x13aa;
export const REPORT_SIZE = 64;

export interface DongleHandle {
  device: HID.HID;
  release(): Promise<void>;
}

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

  const release = async (): Promise<void> => {
    try {
      device.close();
    } catch {
      // best effort — node-hid occasionally throws on double-close
    }
  };

  return { device, release };
}

/**
 * Send a 64-byte HID output report. The input data is padded with
 * zeros if shorter than `REPORT_SIZE`. `data[0]` must be the HID
 * report id (`0x04` for this device).
 */
export function hidWrite(
  handle: DongleHandle,
  data: Buffer,
  _timeoutMs = 500,
): Promise<void> {
  if (data.length > REPORT_SIZE) {
    throw new Error(
      `hidWrite: data is ${data.length} bytes, max ${REPORT_SIZE}`,
    );
  }
  const padded = Buffer.alloc(REPORT_SIZE);
  data.copy(padded, 0);
  // node-hid's .write is synchronous but conceptually async —
  // wrap to keep the protocol-layer API async.
  return new Promise<void>((resolve, reject) => {
    try {
      const n = handle.device.write(Array.from(padded));
      if (n <= 0) {
        reject(new Error(`hidWrite returned ${n}`));
      } else {
        resolve();
      }
    } catch (e) {
      reject(e as Error);
    }
  });
}

/**
 * Read a single HID input report with a blocking timeout. Returns a
 * Buffer of the full report bytes. `readTimeout` is synchronous in
 * node-hid; we wrap in a Promise for API symmetry with hidWrite.
 */
export function hidRead(
  handle: DongleHandle,
  timeoutMs = 500,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const bytes = handle.device.readTimeout(timeoutMs);
      if (!bytes || bytes.length === 0) {
        reject(new Error("hidRead returned empty buffer (timeout?)"));
        return;
      }
      resolve(Buffer.from(bytes));
    } catch (e) {
      reject(e as Error);
    }
  });
}
