/**
 * Transport-layer abstraction for talking to the Axon dongle.
 *
 * Everything above this file (the protocol layer in `protocol.ts` and
 * the command implementations in `commands/`) only depends on this
 * interface — they never see the underlying USB/HID library. That
 * gives us three things:
 *
 *   1. Test injection: `test/mocks/mock-dongle.ts` implements
 *      `DongleHandle` with an in-memory state machine, so the unit
 *      tests don't need real hardware.
 *   2. WebHID port: a future browser-based version of the CLI can
 *      implement `DongleHandle` on top of `navigator.hid` without
 *      touching the protocol layer at all.
 *   3. No accidental coupling: nothing in `protocol.ts` can
 *      grab the `node-hid` `HID.HID` object and call something
 *      transport-specific on it (like `dev.reset()`, which would
 *      put the dongle into cold state — see
 *      `docs/FINDINGS.md`).
 */

export interface DongleHandle {
  /**
   * Send a single 64-byte HID output report. The data buffer is
   * zero-padded up to the report size if shorter; `data[0]` must be
   * the HID report id (`0x04` for the Axon dongle).
   */
  write(data: Buffer, timeoutMs?: number): Promise<void>;

  /**
   * Read a single HID input report from the dongle, with a blocking
   * timeout. Resolves with a Buffer of the full report bytes
   * (typically 64). The first byte is the report id.
   */
  read(timeoutMs?: number): Promise<Buffer>;

  /**
   * Close the underlying device handle. Idempotent — safe to call
   * more than once. After release, write/read MUST NOT be called.
   */
  release(): Promise<void>;
}
