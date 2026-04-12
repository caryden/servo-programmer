#!/usr/bin/env sh
set -eu

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: Bun is required. Install it from https://bun.sh/" >&2
  exit 127
fi

# Match the required CI checks as closely as a local platform can at the
# workspace root.
bun install --frozen-lockfile
bun run ci
