import { describe, expect, test } from "bun:test";
import { confirm } from "../src/util/prompt.ts";
import { captureIO } from "./helpers/capture-io.ts";

interface StdinState {
  descriptor: PropertyDescriptor | undefined;
  pause: typeof process.stdin.pause;
  resume: typeof process.stdin.resume;
}

async function withInteractiveStdin(run: () => Promise<void>): Promise<void> {
  const original: StdinState = {
    descriptor: Object.getOwnPropertyDescriptor(process.stdin, "isTTY"),
    pause: process.stdin.pause,
    resume: process.stdin.resume,
  };

  Object.defineProperty(process.stdin, "isTTY", {
    value: true,
    configurable: true,
  });
  process.stdin.pause = (() => process.stdin) as typeof process.stdin.pause;
  process.stdin.resume = (() => process.stdin) as typeof process.stdin.resume;

  try {
    await run();
  } finally {
    process.stdin.pause = original.pause;
    process.stdin.resume = original.resume;
    if (original.descriptor === undefined) {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    } else {
      Object.defineProperty(process.stdin, "isTTY", original.descriptor);
    }
  }
}

function sendStdinLine(line: string): void {
  queueMicrotask(() => {
    process.stdin.emit("data", Buffer.from(`${line}\n`, "utf8"));
  });
}

describe("confirm", () => {
  test("defaults to false when stdin is not interactive", async () => {
    expect(await confirm("Continue?")).toBe(false);
  });

  test("can be called twice without consuming stdin", async () => {
    const io = captureIO();
    const initialDataListeners = process.stdin.listenerCount("data");

    try {
      await withInteractiveStdin(async () => {
        const first = confirm("First?");
        sendStdinLine("y");
        expect(await first).toBe(true);

        const second = confirm("Second?");
        sendStdinLine("n");
        expect(await second).toBe(false);
      });
    } finally {
      io.restore();
    }

    expect(io.stderr).toContain("First? [y/N]");
    expect(io.stderr).toContain("Second? [y/N]");
    expect(process.stdin.listenerCount("data")).toBe(initialDataListeners);
  });
});
