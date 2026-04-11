#!/usr/bin/env sh
set -eu

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT/axon"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: Bun is required. Install it from https://bun.sh/" >&2
  exit 127
fi

# Match the required CI checks as closely as a local platform can:
# dependencies, Biome check, TypeScript, and the Bun test suite.
bun install --frozen-lockfile
bun run check
bun run typecheck
bun test
