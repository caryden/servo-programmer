import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWriteWithHandle } from "../../src/commands/write.ts";
import { AxonError, ExitCode } from "../../src/errors.ts";
import { captureIO } from "../helpers/capture-io.ts";
import { MockDongle } from "../mocks/mock-dongle.ts";

const GLOBALS = { json: false, quiet: false, yes: true };

function expectAxonError(error: AxonError | undefined): AxonError {
  expect(error).toBeInstanceOf(AxonError);
  if (!(error instanceof AxonError)) {
    throw new Error("expected AxonError");
  }
  return error;
}

function withTempSvo(bytes: Buffer, fn: (path: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "axon-write-"));
  const path = join(dir, "config.svo");
  writeFileSync(path, bytes);
  return fn(path).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe("axon write model-id safety", () => {
  test("rejects .svo files with an empty model id before showing a diff", async () => {
    const mock = new MockDongle();
    const bytes = Buffer.from(mock.config);
    bytes.fill(0, 0x40, 0x48);
    bytes[0x04] = 0xff;

    await withTempSvo(bytes, async (path) => {
      const cap = captureIO();
      let caught: AxonError | undefined;
      try {
        await runWriteWithHandle(mock, GLOBALS, { from: path, dryRun: false });
      } catch (e) {
        caught = e as AxonError;
      } finally {
        cap.restore();
      }

      const error = expectAxonError(caught);
      expect(error.code).toBe(ExitCode.ValidationError);
      expect(error.message).toContain("empty model id");
      expect(cap.stderr).not.toContain("The following");
      expect(mock.config[0x04]).not.toBe(0xff);
    });
  });

  test("rejects mismatched model ids before showing a diff", async () => {
    const mock = new MockDongle();
    const bytes = Buffer.from(mock.config);
    bytes[0x04] = 0xfe;
    Buffer.from("SA81BHMW", "ascii").copy(bytes, 0x40);

    await withTempSvo(bytes, async (path) => {
      const cap = captureIO();
      let caught: AxonError | undefined;
      try {
        await runWriteWithHandle(mock, GLOBALS, { from: path, dryRun: false });
      } catch (e) {
        caught = e as AxonError;
      } finally {
        cap.restore();
      }

      const error = expectAxonError(caught);
      expect(error.code).toBe(ExitCode.ValidationError);
      expect(error.message).toContain("SA81BHMW");
      expect(error.message).toContain("SA33****");
      expect(cap.stderr).not.toContain("The following");
      expect(mock.config[0x04]).not.toBe(0xfe);
    });
  });

  test("allows matching model ids and honors dry-run", async () => {
    const mock = new MockDongle();
    const bytes = Buffer.from(mock.config);
    bytes[0x04] = 0xfd;

    await withTempSvo(bytes, async (path) => {
      const cap = captureIO();
      let code: number;
      try {
        code = await runWriteWithHandle(mock, GLOBALS, { from: path, dryRun: true });
      } finally {
        cap.restore();
      }

      expect(code).toBe(ExitCode.Ok);
      expect(cap.stderr).toContain("The following");
      expect(cap.stderr).toContain("--dry-run");
      expect(mock.config[0x04]).not.toBe(0xfd);
    });
  });
});
