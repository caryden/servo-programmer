/**
 * Minimal interactive prompt helpers. Kept dependency-free.
 */

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
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Uint8Array);
    const combined = Buffer.concat(chunks).toString("utf8");
    if (combined.includes("\n")) {
      const answer = (combined.split("\n")[0] ?? "").trim().toLowerCase();
      return answer === "y" || answer === "yes";
    }
  }
  return false;
}
