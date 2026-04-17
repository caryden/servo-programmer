/**
 * Transport abstraction for talking to the Axon dongle.
 *
 * This should be implementable by node-hid, WebHID, or test doubles.
 */

export interface DongleHandle {
  write(data: Buffer, timeoutMs?: number): Promise<void>;
  read(timeoutMs?: number): Promise<Buffer>;
  release(): Promise<void>;
}
