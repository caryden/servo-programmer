/**
 * Integration-level tests for `axon get` against the MockDongle.
 *
 * These exercise the full command path: identify → readFullConfig →
 * parameter lookup → render. stdout/stderr are captured and asserted.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runGetWithHandle } from "../../src/commands/get.ts";
import type { DongleHandle } from "../../src/driver/transport.ts";
import { AxonError, ExitCode } from "../../src/errors.ts";
import { type CapturedIO, captureIO } from "../helpers/capture-io.ts";
import { MockDongle } from "../mocks/mock-dongle.ts";

/**
 * Wrap a MockDongle such that identify replies report CR mode
 * (rx[5]=0x04) instead of the default servo mode (rx[5]=0x03).
 */
function crModeHandle(inner: MockDongle): DongleHandle {
  return {
    async write(data: Buffer, timeoutMs?: number): Promise<void> {
      return inner.write(data, timeoutMs);
    },
    async read(timeoutMs?: number): Promise<Buffer> {
      const rx = await inner.read(timeoutMs);
      // Only rewrite identify-shaped replies: rx[1]=0x01, rx[2]=0x00,
      // rx[5] in {0x03, 0x04}, rx[7]=0x01. Leaves read/write replies
      // untouched.
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
    async release(): Promise<void> {
      return inner.release();
    },
  };
}

function expectAxonError(error: AxonError | undefined): AxonError {
  expect(error).toBeInstanceOf(AxonError);
  if (!(error instanceof AxonError)) {
    throw new Error("expected AxonError");
  }
  return error;
}

const GLOBALS = { json: false, quiet: false, yes: false };
const GLOBALS_JSON = { json: true, quiet: false, yes: false };

describe("axon get (servo_mode)", () => {
  let io: CapturedIO;
  beforeEach(() => {
    io = captureIO();
  });
  afterEach(() => {
    io.restore();
  });

  test("no param: lists parameters available in the current mode", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, { raw: false, help: false });
    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("servo_angle");
    expect(io.stdout).toContain("servo_neutral");
    expect(io.stdout).toContain("sensitivity");
    expect(io.stdout).toContain("pwm_power");
  });

  test("no param --json: returns structured list with values", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS_JSON, { raw: false, help: false });
    expect(code).toBe(ExitCode.Ok);
    const parsed = JSON.parse(io.stdout);
    expect(parsed.mode).toBe("servo_mode");
    expect(Array.isArray(parsed.parameters)).toBe(true);
    const angle = parsed.parameters.find((p: { name: string }) => p.name === "servo_angle");
    expect(angle).toBeDefined();
    expect(typeof angle.value).toBe("number");
  });

  test("get servo_angle: returns the raw value", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, {
      param: "servo_angle",
      raw: false,
      help: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("130");
  });

  test("get servo_angle --json: machine-readable", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS_JSON, {
      param: "servo_angle",
      raw: false,
      help: false,
    });
    expect(code).toBe(ExitCode.Ok);
    const parsed = JSON.parse(io.stdout);
    expect(parsed.name).toBe("servo_angle");
    expect(parsed.unit).toBe("raw");
    expect(typeof parsed.value).toBe("number");
  });

  test("get servo_angle --raw: emits the raw byte", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, {
      param: "servo_angle",
      raw: true,
      help: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("0x82"); // fixture byte 0x04 = 130
  });

  test("get servo_neutral: 0 µs (fixture)", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, {
      param: "servo_neutral",
      raw: false,
      help: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("µs");
  });

  test("get pwm_power: 86%", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, {
      param: "pwm_power",
      raw: false,
      help: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("86%");
  });

  test("get inversion: 'reversed' (fixture bit is set)", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, {
      param: "inversion",
      raw: false,
      help: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("reversed");
  });

  test("get loose_pwm_protection: shows the enum mode", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, {
      param: "loose_pwm_protection",
      raw: false,
      help: false,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("neutral");
  });
});

describe("axon get error paths", () => {
  let io: CapturedIO;
  beforeEach(() => {
    io = captureIO();
  });
  afterEach(() => {
    io.restore();
  });

  test("get dampening_factor: returns the raw BE-u16 value", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, {
      param: "dampening_factor",
      raw: false,
      help: false,
    });
    expect(code).toBe(ExitCode.Ok);
    // Fixture bytes 0x0A:0x0B = 0x00:0x50 = 80
    expect(io.stdout).toContain("80");
  });

  test("get servo_angle in cr_mode: mode validation error", async () => {
    const mock = new MockDongle();
    const handle = crModeHandle(mock);
    let caught: AxonError | undefined;
    try {
      await runGetWithHandle(handle, GLOBALS, {
        param: "servo_angle",
        raw: false,
        help: false,
      });
    } catch (e) {
      caught = e as AxonError;
    }
    const error = expectAxonError(caught);
    expect(error.code).toBe(ExitCode.ValidationError);
    expect(error.message).toContain("not available");
    expect(error.message.toLowerCase()).toContain("cr mode");
  });

  test("get unknown_param: usage error", async () => {
    const mock = new MockDongle();
    let caught: AxonError | undefined;
    try {
      await runGetWithHandle(mock, GLOBALS, {
        param: "unknown_param",
        raw: false,
        help: false,
      });
    } catch (e) {
      caught = e as AxonError;
    }
    const error = expectAxonError(caught);
    expect(error.code).toBe(ExitCode.UsageError);
    expect(error.message).toContain("unknown parameter");
  });

  test("get servo_angle --help: does NOT leak 'implementation' into output", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, {
      param: "servo_angle",
      raw: false,
      help: true,
    });
    expect(code).toBe(ExitCode.Ok);
    // Critical audience-separation check: the user-facing help must
    // never leak implementation-level details from the catalog.
    expect(io.stdout).not.toContain("offset");
    expect(io.stdout).not.toContain("0x0A");
    expect(io.stdout).not.toContain("be_u16");
    expect(io.stdout).not.toContain("widget");
    expect(io.stdout).not.toContain("confidence");
    expect(io.stdout).not.toContain("source");
    // But it MUST include the user-facing description.
    expect(io.stdout).toContain("Servo Angle");
    expect(io.stdout.toLowerCase()).toContain("sweep");
  });

  test("get dampening_factor --help: shows parameter description", async () => {
    const mock = new MockDongle();
    const code = await runGetWithHandle(mock, GLOBALS, {
      param: "dampening_factor",
      raw: false,
      help: true,
    });
    expect(code).toBe(ExitCode.Ok);
    expect(io.stdout).toContain("Dampening Factor");
    expect(io.stdout).toContain("damping");
  });
});
