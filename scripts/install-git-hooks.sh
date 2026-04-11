#!/usr/bin/env sh
set -eu

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

git -C "$ROOT" config core.hooksPath .githooks
chmod +x "$ROOT/.githooks/pre-commit" "$ROOT/scripts/ci-local.sh" "$ROOT/scripts/install-git-hooks.sh"

echo "Installed servo-programmer git hooks with core.hooksPath=.githooks"
