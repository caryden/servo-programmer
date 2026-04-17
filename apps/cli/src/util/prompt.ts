/**
 * Minimal interactive prompt helpers. Kept dependency-free.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

/**
 * Ask a yes/no question on stderr, read answer from stdin. Default is
 * "no" — an empty line or anything not starting with y/Y returns false.
 * Non-interactive callers (pipes) get the default answer.
 */
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    // non-interactive — treat as "no" so destructive ops can't be
    // silently run from a pipe without --yes
    return false;
  }
  process.stderr.write(`${question} [y/N] `);
  const answer = (await readLineFromStdin()).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

/** Read a single line from stdin without consuming the async iterator. */
export function readLineFromStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = [];

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      process.stdin.removeListener("error", onError);
      process.stdin.pause();
    };

    const finish = (line: string) => {
      cleanup();
      resolve(line);
    };

    const currentLine = (): string => {
      const combined = textDecoder.decode(concatBytes(chunks));
      const newlineIndex = combined.indexOf("\n");
      const line = newlineIndex >= 0 ? combined.slice(0, newlineIndex) : combined;
      return line.replace(/\r$/, "");
    };

    const onData = (chunk: Uint8Array | string) => {
      chunks.push(typeof chunk === "string" ? textEncoder.encode(chunk) : Uint8Array.from(chunk));
      const combined = textDecoder.decode(concatBytes(chunks));
      if (combined.includes("\n")) {
        finish(currentLine());
      }
    };

    const onEnd = () => finish(currentLine());
    const onError = () => finish("");

    process.stdin.resume();
    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.once("error", onError);
  });
}
