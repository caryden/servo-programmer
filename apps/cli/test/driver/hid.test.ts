/**
 * Tests for the production node-hid transport in
 * `packages/transport-nodehid/src/hid.ts`.
 *
 * These bypass the CLI re-export layer on purpose. Other CLI command tests
 * mock `src/driver/hid.ts`, and importing that wrapper here can race with
 * those mocks on Windows. By importing the transport package source directly,
 * this file exercises the real HID wrapper without sharing a module identity
 * with the higher-level CLI tests.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { AxonError } from "../../src/errors.ts";

describe("hid transport", () => {
  afterEach(() => {
    mock.restore();
  });

  test("openDongle exposes visible devices and wraps readTimeout errors", async () => {
    const device = {
      path: "mock-path",
      vendorId: 0x0471,
      productId: 0x13aa,
      product: "USBBootloader V1.3",
      manufacturer: "Stone Laboratories inc.",
    };

    const writeLengths: number[] = [];

    class FakeHID {
      public readonly path: string;

      constructor(path: string) {
        this.path = path;
      }

      write(bytes: number[]): number {
        writeLengths.push(bytes.length);
        return bytes.length;
      }

      readTimeout(timeoutMs: number): number[] {
        throw new Error(`readTimeout failed after ${timeoutMs} ms`);
      }

      close(): void {}
    }

    await mock.module("../../../../packages/transport-nodehid/src/nodehid.ts", () => ({
      getNodeHidBinding: () => ({
        devices: () => [device],
        HID: FakeHID,
      }),
    }));

    const { listDongles, openDongle, REPORT_SIZE } = await import(
      "../../../../packages/transport-nodehid/src/hid.ts?hid-transport-test"
    );

    expect(listDongles()).toHaveLength(1);
    expect(listDongles()[0]).toMatchObject(device);

    const handle = await openDongle();
    await handle.write(Buffer.from([0x04, 0x8a]), 123);
    expect(writeLengths).toEqual([REPORT_SIZE]);

    let caught: unknown;
    try {
      await handle.read(250);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AxonError);
    expect((caught as AxonError).category).toBe("adapter_io");
    expect((caught as Error).message).toContain("readTimeout failed after 250 ms");

    await handle.release();
  });
});
