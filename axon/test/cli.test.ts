import { describe, expect, test } from "bun:test";
import { main, parseArgs } from "../src/cli.ts";
import { ExitCode } from "../src/errors.ts";

interface CapturedIO {
  stderr: string;
  restore: () => void;
}

function captureStderr(): CapturedIO {
  const chunks: Uint8Array[] = [];
  const origErr = process.stderr.write.bind(process.stderr);
  // @ts-expect-error override
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    return true;
  };
  return {
    get stderr() {
      return Buffer.concat(chunks).toString("utf8");
    },
    restore() {
      process.stderr.write = origErr;
    },
  };
}

describe("parseArgs", () => {
  test("keeps negative numeric values as positional arguments", () => {
    const parsed = parseArgs(["set", "servo_neutral", "-20", "--yes"]);

    expect(parsed.command).toBe("set");
    expect(parsed.positional).toEqual(["servo_neutral", "-20"]);
    expect(parsed.global.yes).toBe(true);
    expect(parsed.flags["20"]).toBeUndefined();
  });

  test("keeps negative decimal values as positional arguments", () => {
    const parsed = parseArgs(["set", "servo_neutral", "-.5"]);

    expect(parsed.command).toBe("set");
    expect(parsed.positional).toEqual(["servo_neutral", "-.5"]);
  });
});

describe("main error envelope", () => {
  test("--json AxonError output includes category", async () => {
    const cap = captureStderr();
    let code: number;
    try {
      code = await main(["--json", "write"]);
    } finally {
      cap.restore();
    }

    expect(code).toBe(ExitCode.UsageError);
    const error = JSON.parse(cap.stderr);
    expect(error.code).toBe(ExitCode.UsageError);
    expect(error.category).toBe("usage");
    expect(error.error).toContain("--from");
  });
});
