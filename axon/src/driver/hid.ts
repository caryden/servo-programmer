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
import { AxonError, ExitCode } from "../errors.ts";
import type { DongleHandle } from "./transport.ts";

export const VID = 0x0471;
export const PID = 0x13aa;
export const REPORT_SIZE = 64;

/**
 * Small utility: how long to wait before retrying a transient HID
 * I/O failure. node-hid on macOS is occasionally flaky for a
 * window of tens of milliseconds right after a device plug event
 * (or a hot-swap between two Axon servos with the same
 * VID/PID/product), so one retry dramatically reduces "false
 * failure" exits without noticeably slowing down the normal path.
 */
const HID_RETRY_DELAY_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Translate a raw node-hid write failure into an AxonError with a
 * clean user-facing message and an actionable hint. The top-level
 * cli.ts handler renders AxonError specially (no stack trace), so
 * wrapping here keeps the user experience graceful.
 */
function hidWriteError(detail: string): AxonError {
  return new AxonError(
    ExitCode.ServoIoError,
    `Cannot write to the Axon dongle (${detail}).`,
    "Unplug and replug the dongle, then retry. If the problem persists: " +
      "make sure no other process is holding the device open (the vendor " +
      "exe in Parallels, an older axon process, or a Saleae Logic 2 " +
      "automation connection). On macOS, hot-swapping between two servos " +
      "connected to the same dongle sometimes leaves the HID handle in a " +
      "stale state for a few seconds — a physical dongle replug fixes it.",
  );
}

/**
 * Same idea for read failures (which on the Axon dongle are almost
 * always write failures in disguise, because every read is preceded
 * by a write that set up the response).
 */
function hidReadError(detail: string): AxonError {
  return new AxonError(
    ExitCode.ServoIoError,
    `Cannot read from the Axon dongle (${detail}).`,
    "Unplug and replug the dongle, then retry. If the dongle is enumerating " +
      "but reads keep timing out, the servo may have been hot-swapped or " +
      "gone into a cold state; replug the servo (leaving the dongle " +
      "connected) to re-prime it.",
  );
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

  async write(data: Buffer, _timeoutMs = 500): Promise<void> {
    if (this.released) {
      throw hidWriteError("handle was released");
    }
    if (data.length > REPORT_SIZE) {
      throw hidWriteError(
        `buffer is ${data.length} bytes, max is ${REPORT_SIZE}`,
      );
    }
    const padded = Buffer.alloc(REPORT_SIZE);
    data.copy(padded, 0);
    const payload = Array.from(padded);

    // Attempt the write, then retry once after a short delay on
    // transient errors. node-hid can throw a raw TypeError here
    // ("Cannot write to hid device") when the device is in a
    // just-plugged / hot-swap / stale-handle state — one retry
    // usually clears it.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const n = this.device.write(payload);
        if (n <= 0) {
          lastError = new Error(
            `node-hid write returned ${n} (expected ${REPORT_SIZE})`,
          );
        } else {
          return; // success
        }
      } catch (e) {
        lastError = e;
      }
      if (attempt === 0) {
        await sleep(HID_RETRY_DELAY_MS);
      }
    }
    // Both attempts failed — surface a clean AxonError.
    throw hidWriteError((lastError as Error).message ?? "unknown failure");
  }

  async read(timeoutMs = 500): Promise<Buffer> {
    if (this.released) {
      throw hidReadError("handle was released");
    }
    try {
      const bytes = this.device.readTimeout(timeoutMs);
      if (!bytes || bytes.length === 0) {
        throw hidReadError(
          `read timed out after ${timeoutMs} ms (no bytes available)`,
        );
      }
      return Buffer.from(bytes);
    } catch (e) {
      if (e instanceof AxonError) throw e;
      throw hidReadError((e as Error).message ?? "unknown failure");
    }
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
