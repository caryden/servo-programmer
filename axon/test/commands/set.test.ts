/**
 * Integration tests for `axon set` against the MockDongle.
 *
 * These exercise the full read-modify-write-verify cycle and the
 * mode/validation guards. `--yes` is used in the `GlobalFlags` to
 * skip the interactive confirm; stdin is never touched.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSetWithHandle } from "../../src/commands/set.ts";
import type { DongleHandle } from "../../src/driver/transport.ts";
import { AxonError, ExitCode } from "../../src/errors.ts";
import { MockDongle } from "../mocks/mock-dongle.ts";

interface CapturedIO {
  stdout: string;
  stderr: string;
  restore: () => void;
}

function captureIO(): CapturedIO {
  const chunks = { stdout: [] as Uint8Array[], stderr: [] as Uint8Array[] };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // @ts-expect-error override
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    chunks.stdout.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    return true;
  };
  // @ts-expect-error override
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    chunks.stderr.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    return true;
  };
  return {
    get stdout() {
      return Buffer.concat(chunks.stdout).toString("utf8");
    },
    get stderr() {
      return Buffer.concat(chunks.stderr).toString("utf8");
    },
    restore() {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

const GLOBALS = { json: false, quiet: false, yes: true };
const GLOBALS_JSON = { json: true, quiet: false, yes: true };

function byteAt(bytes: Uint8Array, index: number): number {
  return bytes[index] ?? 0;
}

function expectAxonError(error: AxonError | undefined): AxonError {
  expect(error).toBeInstanceOf(AxonError);
  if (!(error instanceof AxonError)) {
    throw new Error("expected AxonError");
  }
  return error;
}

function crModeHandle(inner: MockDongle): DongleHandle {
  return {
    async write(data, timeoutMs) {
      return inner.write(data, timeoutMs);
    },
    async read(timeoutMs) {
      const rx = await inner.read(timeoutMs);
      if (
        rx[1] === 0x01 &&
        rx[2] === 0x00 &&
        (rx[5] === 0x03 || rx[5] === 0x04) &&
        rx[7] === 0x01
      ) {
        const out = Buffer.from(rx);
        out[5] = 0x04;
        return out;
      }
      return rx;
    },
    async release() {
      return inner.release();
    },
  };
}

describe("axon set (happy path)", () => {
  let io: CapturedIO;
  beforeEach(() => {
    io = captureIO();
  });
  afterEach(() => {
    io.restore();
  });

  test("set servo_angle 180 in servo_mode updates the fixture config", async () => {
    const mock = new MockDongle();
    const before = mock.config[0x04];
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["servo_angle", "180"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(mock.config[0x04]).toBe(180);
    expect(mock.config[0x04]).not.toBe(before);
    // Mirror at 0x05 should match.
    expect(mock.config[0x05]).toBe(180);
    expect(io.stderr).toContain("servo_angle");
  });

  test("set servo_neutral -20 writes 0x6C", async () => {
    const mock = new MockDongle();
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["servo_neutral", "-20"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(mock.config[0x06]).toBe(108); // 128 - 20
  });

  test("set pwm_power 75 updates primary + mirrors + 0x0F", async () => {
    const mock = new MockDongle();
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["pwm_power", "75"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    const primary = Math.round((75 * 255) / 100); // 191
    expect(mock.config[0x11]).toBe(primary);
    expect(mock.config[0x12]).toBe(primary);
    expect(mock.config[0x13]).toBe(primary);
    expect(mock.config[0x0f]).toBe(primary - 20);
  });

  test("set inversion normal clears bit 0x02 at 0x25", async () => {
    const mock = new MockDongle();
    // Fixture has the bit SET (inversion=reversed). Set it to normal.
    expect(byteAt(mock.config, 0x25) & 0x02).toBe(0x02);
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["inversion", "normal"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(byteAt(mock.config, 0x25) & 0x02).toBe(0);
  });

  test("set sensitivity 7 writes raw 0x80", async () => {
    const mock = new MockDongle();
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["sensitivity", "7"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(mock.config[0x0c]).toBe(0x80);
  });

  test("--dry-run does NOT modify the config", async () => {
    const mock = new MockDongle();
    const snapshot = Buffer.from(mock.config);
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["servo_angle", "180"],
      dryRun: true,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(Array.from(mock.config)).toEqual(Array.from(snapshot));
  });

  test("no-change set is a no-op", async () => {
    const mock = new MockDongle();
    // Fixture has servo_neutral=0; setting 0 is a no-op.
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["servo_neutral", "0"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(io.stderr).toContain("No change");
  });

  test("--json emits structured output", async () => {
    const mock = new MockDongle();
    const code = await runSetWithHandle(mock, GLOBALS_JSON, {
      positional: ["servo_angle", "180"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    const parsed = JSON.parse(io.stdout);
    expect(parsed.changed).toBe(true);
    expect(parsed.changes.length).toBe(1);
    expect(parsed.changes[0].name).toBe("servo_angle");
  });
});

describe("axon set (default restoration)", () => {
  let io: CapturedIO;
  beforeEach(() => {
    io = captureIO();
  });
  afterEach(() => {
    io.restore();
  });

  test("set servo_angle default restores the catalog default", async () => {
    const mock = new MockDongle();
    // Start from 180° (non-default)
    await runSetWithHandle(mock, GLOBALS, {
      positional: ["servo_angle", "180"],
      dryRun: false,
    });
    // Reset
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["servo_angle", "default"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    // Default for Mini is raw 80 (≈111°)
    expect(mock.config[0x0b]).toBe(80);
  });

  test("set default resets all params in the current mode", async () => {
    const mock = new MockDongle();
    // Start by changing multiple params.
    await runSetWithHandle(mock, GLOBALS, {
      positional: ["servo_angle", "200"],
      dryRun: false,
    });
    await runSetWithHandle(mock, GLOBALS, {
      positional: ["pwm_power", "50"],
      dryRun: false,
    });
    // Now reset ALL.
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["default"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    // servo_angle back to ~80 (raw)
    expect(mock.config[0x0b]).toBe(80);
    // pwm_power back to ~86% → raw 0xDC (219 or 220 depending on rounding)
    expect(Math.abs(byteAt(mock.config, 0x11) - 219)).toBeLessThanOrEqual(1);
  });

  test("set <param> default with no catalog default leaves value unchanged", async () => {
    // The Axon Max (SA81BHMW) is populated in the catalog from
    // decrypted firmware only — it has no defaults map, so
    // `axon set <param> default` must print an observation and leave
    // the servo untouched rather than throwing a validation error.
    const maxSeed = Buffer.from(
      new MockDongle().config, // borrow the Mini fixture as the byte soup
    );
    // Overwrite the model-id bytes (0x40..0x47) with "SA81BHMW" so
    // modelIdFromConfig() classifies this as a Max.
    const maxId = Buffer.from("SA81BHMW", "ascii");
    maxId.copy(maxSeed, 0x40);
    const mock = new MockDongle(maxSeed);
    // Capture what servo_angle's raw byte was before the attempted reset.
    const before = Buffer.from(mock.config);
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["servo_angle", "default"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    // Config bytes must be untouched — the command reported the
    // observation without writing anything.
    expect(Array.from(mock.config)).toEqual(Array.from(before));
    // The human-readable message is on stderr.
    expect(io.stderr).toContain("no default value");
    expect(io.stderr).toContain("servo_angle");
    expect(io.stderr).toContain("SA81BHMW");
    expect(io.stderr).toContain("leaving value at");
  });

  test("set <param> default with no catalog default emits no_default in --json", async () => {
    const maxSeed = Buffer.from(new MockDongle().config);
    Buffer.from("SA81BHMW", "ascii").copy(maxSeed, 0x40);
    const mock = new MockDongle(maxSeed);
    const code = await runSetWithHandle(mock, GLOBALS_JSON, {
      positional: ["servo_angle", "default"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    const line = io.stdout.trim().split("\n").pop() ?? "";
    const parsed = JSON.parse(line);
    expect(parsed.changed).toBe(false);
    expect(parsed.reason).toBe("no_default");
    expect(parsed.param).toBe("servo_angle");
    expect(typeof parsed.current).toBe("string");
  });

  test("set default --backup writes the current config to the backup file", async () => {
    const mock = new MockDongle();
    const backupPath = join(tmpdir(), `axon-set-default-backup-${Date.now()}.svo`);
    try {
      const snapshot = Buffer.from(mock.config);
      // Modify first so the backup actually differs from the defaults.
      await runSetWithHandle(mock, GLOBALS, {
        positional: ["servo_angle", "200"],
        dryRun: false,
      });
      const modified = Buffer.from(mock.config);
      // Reset with backup.
      const code = await runSetWithHandle(mock, GLOBALS, {
        positional: ["default"],
        backup: backupPath,
        dryRun: false,
      });
      expect(code).toBe(ExitCode.Ok);
      expect(existsSync(backupPath)).toBe(true);
      const backupBytes = readFileSync(backupPath);
      expect(backupBytes.length).toBe(95);
      // The backup should match the "modified" snapshot (i.e., the
      // state BEFORE set default ran), not the original fixture.
      expect(Array.from(backupBytes)).toEqual(Array.from(modified));
      // And certainly shouldn't match the original fixture (we changed it).
      expect(Array.from(backupBytes)).not.toEqual(Array.from(snapshot));
    } finally {
      if (existsSync(backupPath)) unlinkSync(backupPath);
    }
  });
});

describe("axon set (error paths)", () => {
  let io: CapturedIO;
  beforeEach(() => {
    io = captureIO();
  });
  afterEach(() => {
    io.restore();
  });

  test("set servo_angle 180 in CR mode is rejected with mode error", async () => {
    const mock = new MockDongle();
    const handle = crModeHandle(mock);
    let caught: AxonError | undefined;
    try {
      await runSetWithHandle(handle, GLOBALS, {
        positional: ["servo_angle", "180"],
        dryRun: false,
      });
    } catch (e) {
      caught = e as AxonError;
    }
    const error = expectAxonError(caught);
    expect(error.code).toBe(ExitCode.ValidationError);
    expect(error.message).toContain("not available");
  });

  test("set loose_pwm_protection release writes the correct bits", async () => {
    const mock = new MockDongle();
    // Fixture has bits 0x60 (neutral). Setting to release clears those bits.
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["loose_pwm_protection", "release"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(byteAt(mock.config, 0x25) & 0x60).toBe(0x00);
  });

  test("set dampening_factor 5 writes to all four mirror offsets", async () => {
    const mock = new MockDongle();
    const code = await runSetWithHandle(mock, GLOBALS, {
      positional: ["dampening_factor", "5"],
      dryRun: false,
    });
    expect(code).toBe(ExitCode.Ok);
    // BE-u16 value 5 = 0x00 0x05 at each mirror pair
    expect(mock.config[0x0a]).toBe(0x00);
    expect(mock.config[0x0b]).toBe(0x05);
    expect(mock.config[0x27]).toBe(0x00);
    expect(mock.config[0x28]).toBe(0x05);
    expect(mock.config[0x29]).toBe(0x00);
    expect(mock.config[0x2a]).toBe(0x05);
    expect(mock.config[0x2b]).toBe(0x00);
    expect(mock.config[0x2c]).toBe(0x05);
  });

  test("set unknown_param 5 is a usage error", async () => {
    const mock = new MockDongle();
    let caught: AxonError | undefined;
    try {
      await runSetWithHandle(mock, GLOBALS, {
        positional: ["unknown_param", "5"],
        dryRun: false,
      });
    } catch (e) {
      caught = e as AxonError;
    }
    const error = expectAxonError(caught);
    expect(error.code).toBe(ExitCode.UsageError);
  });

  test("set servo_angle 400 is rejected as out-of-range", async () => {
    const mock = new MockDongle();
    let caught: AxonError | undefined;
    try {
      await runSetWithHandle(mock, GLOBALS, {
        positional: ["servo_angle", "400"],
        dryRun: false,
      });
    } catch (e) {
      caught = e as AxonError;
    }
    const error = expectAxonError(caught);
    expect(error.code).toBe(ExitCode.ValidationError);
    expect(error.message).toContain("out of range");
  });

  test("set with no positional args is a usage error", async () => {
    const mock = new MockDongle();
    let caught: AxonError | undefined;
    try {
      await runSetWithHandle(mock, GLOBALS, {
        positional: [],
        dryRun: false,
      });
    } catch (e) {
      caught = e as AxonError;
    }
    const error = expectAxonError(caught);
    expect(error.code).toBe(ExitCode.UsageError);
  });
});
