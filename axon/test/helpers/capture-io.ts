import { spyOn } from "bun:test";

export interface CapturedIO {
  readonly stdout: string;
  readonly stderr: string;
  restore: () => void;
}

function toBuffer(chunk: string | Uint8Array): Buffer {
  return typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
}

export function captureIO(): CapturedIO {
  const chunks = {
    stdout: [] as Buffer[],
    stderr: [] as Buffer[],
  };

  const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(((
    chunk: string | Uint8Array,
  ): boolean => {
    chunks.stdout.push(toBuffer(chunk));
    return true;
  }) as typeof process.stdout.write);
  const stderrSpy = spyOn(process.stderr, "write").mockImplementation(((
    chunk: string | Uint8Array,
  ): boolean => {
    chunks.stderr.push(toBuffer(chunk));
    return true;
  }) as typeof process.stderr.write);

  return {
    get stdout() {
      return Buffer.concat(chunks.stdout).toString("utf8");
    },
    get stderr() {
      return Buffer.concat(chunks.stderr).toString("utf8");
    },
    restore() {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}
