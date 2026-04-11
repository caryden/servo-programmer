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

export type DongleDescriptor = HID.Device;

/**
 * Wrap a raw node-hid failure in an AxonError so the top-level
 * catch in cli.ts renders it cleanly (no stack trace). The detail
 * string is the raw error message from node-hid — we do NOT
 * speculate about the cause in the hint; we just surface what the
 * OS told us and ask the user to replug.
 *
 * Previously this file retried once on failure. The retry was
 * removed because it masked the root cause — if node-hid keeps
 * failing, we want to see the first error verbatim so we can
 * actually fix the bug instead of papering over it.
 */
function hidWriteError(detail: string): AxonError {
  return AxonError.adapterIo(detail);
}

function hidReadError(detail: string): AxonError {
  return AxonError.adapterIo(detail);
}

function hidEnumerateError(detail: string): AxonError {
  return AxonError.adapterIo(`HID enumeration failed: ${detail}`);
}

/**
 * Cheap "which dongles are visible through this OS's HID layer?"
 * check. Does NOT open the device — safe to call from `axon status`
 * and `axon monitor`'s "not-yet-opened" state.
 *
 * This is deliberately phrased as HID visibility rather than physical
 * USB presence: if a VM such as Parallels has captured the adapter,
 * macOS may still list the raw USB device while node-hid cannot see
 * an openable HID interface.
 */
export function listDongles(): DongleDescriptor[] {
  try {
    return HID.devices(VID, PID);
  } catch (e) {
    throw hidEnumerateError((e as Error).message ?? "unknown failure");
  }
}

/**
 * Back-compat helper for callers that only need a boolean.
 */
export function isDonglePresent(): boolean {
  return listDongles().length > 0;
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
      throw hidWriteError(`buffer is ${data.length} bytes, max is ${REPORT_SIZE}`);
    }
    const padded = Buffer.alloc(REPORT_SIZE);
    data.copy(padded, 0);
    try {
      const n = this.device.write(Array.from(padded));
      if (n <= 0) {
        throw hidWriteError(`node-hid write returned ${n} (expected ${REPORT_SIZE})`);
      }
    } catch (e) {
      if (e instanceof AxonError) throw e;
      throw hidWriteError((e as Error).message ?? "unknown failure");
    }
  }

  async read(timeoutMs = 500): Promise<Buffer> {
    if (this.released) {
      throw hidReadError("handle was released");
    }
    try {
      const bytes = this.device.readTimeout(timeoutMs);
      if (!bytes || bytes.length === 0) {
        throw hidReadError(`read timed out after ${timeoutMs} ms (no bytes available)`);
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
 * from the CLI design spec, and emits state-specific errors:
 *
 *   - No matches   → AxonError.noAdapter (category "no_adapter")
 *   - >1 matches   → AxonError.noAdapter
 *   - Open fails   → AxonError.adapterBusy (category "adapter_busy",
 *                    usually another process is claiming it)
 */
export async function openDongle(descriptor?: DongleDescriptor): Promise<DongleHandle> {
  const matches = descriptor ? [descriptor] : listDongles();
  if (matches.length === 0) {
    throw AxonError.noAdapter("Axon dongle not found on USB.");
  }
  if (matches.length > 1) {
    throw AxonError.noAdapter(`Found ${matches.length} Axon dongles on USB — expected exactly 1.`);
  }

  const selected = matches[0];
  if (selected === undefined) {
    throw AxonError.noAdapter("Axon dongle not found on USB.");
  }
  const path = selected.path;
  if (!path) {
    throw AxonError.noAdapter(
      "Axon dongle enumerated but no device path (node-hid returned an entry without `path`).",
    );
  }

  let device: HID.HID;
  try {
    device = new HID.HID(path);
  } catch (e) {
    throw AxonError.adapterBusy((e as Error).message);
  }

  return new NodeHidDongle(device);
}
