# Contributing

Thanks for your interest. This project is small and the codebase moves
fast — read this whole file before opening a PR so we can spend the
review on substance instead of mechanics.

## What this project is (and isn't)

It's a research-experiment-turned-CLI for the Axon Robotics servo
programmer. The bar is "replaces the vendor exe for the common cases on
Mac, Linux, and Windows, with no install hassle." If your contribution
moves us toward that, it's welcome. If it doesn't, we'll talk before you
write code.

The plan to v1.0 lives in the
[v0.2-clean-baseline](https://github.com/caryden/servo-programmer/milestone/1)
and [v1.0](https://github.com/caryden/servo-programmer/milestone/2)
GitHub milestones. The most useful contributions right now are listed
in those issues, especially the `good first issue` and
`help wanted` ones.

## Tools you'll need

| Tool | Why | Notes |
|---|---|---|
| [Bun](https://bun.sh) ≥ 1.3 | Runtime + package manager + test runner | `curl -fsSL https://bun.sh/install \| bash` |
| Git | Source control | Any modern version |
| (optional) Axon dongle + Mini servo | Real-hardware testing | Tests use a mock so you can develop without one |
| (optional) [Ghidra](https://ghidra-sre.org/) | Reading the vendor exe decomp under `research/static-analysis/` | Only needed if you're working on byte mapping |
| (optional) Saleae Logic 2 + a Logic 8 | Capturing new wire traces | Only needed for protocol additions like firmware flashing |

## Local development workflow

```bash
# Clone the repo
git clone https://github.com/caryden/servo-programmer
cd servo-programmer/axon

# Install deps
bun install

# Run the CLI against a real dongle (no sudo)
bun run src/cli.ts status

# Type-check, lint, format, and test before committing
bun run typecheck
bun run check       # Biome lint+format check
bun test
```

(The `check`/`lint`/`format`/`test` scripts land as part of issue
[#5](https://github.com/caryden/servo-programmer/issues/5) — until then
the test runner and Biome aren't wired up yet.)

## Branches and PRs

- `main` is the trunk. Push permissions are limited to maintainers.
- For each issue, create a branch named `issue-NNN-short-description`
  (e.g. `issue-7-decomp-walk`).
- Open a draft PR early so CI runs as you iterate.
- Mark the PR ready for review when:
  - All checklist items in the linked issue are satisfied
  - CI is green
  - You've manually run the affected commands against real hardware
    if your change touches device I/O
- Squash-merge to main with a conventional-commit-style message.
  Each issue is one commit on `main`.

## Commit messages

Conventional Commits, please:

```
feat: implement axon get / set with named parameters + units
fix: handle 0xFA reply when servo is in cold state
docs: polish wire-protocol.md for public audience
test: add MockDongle + protocol + catalog tests (15+)
refactor: extract DongleHandle transport interface
chore: add LICENSE, README, CHANGELOG (v0.2 baseline)
ci: add Biome + GitHub Actions + npm scripts
```

The body of the commit should reference the issue number it closes,
e.g. `Closes #7.`

## Code style

- TypeScript, strict mode, no `any` unless commented why
- Biome handles formatting — don't fight it, just run `bun run format`
- Tests live in `axon/test/`, use `bun test`, and use the `MockDongle`
  fixture (added in #5/#6) — never reach for the real `node-hid` in tests
- Keep modules small and focused. The protocol layer is intentionally
  separated from the transport layer so we can swap node-hid for WebHID
  later (post-v1.0)

## Hardware vs. mock

- The default test path is **mock-only** so CI can run without hardware
- If your change needs to be verified against a real dongle, document
  the manual test steps in the PR description
- Don't add tests that require real hardware — use the mock

## Adding a new servo model to the catalog

`data/servo_catalog.json` is the single source of truth. To add an
unknown servo model:

1. Plug in the servo and run `bun run src/cli.ts read --hex`
2. Note the bytes at offset `0x40..0x47` — that's the model id
3. Save the full block: `bun run src/cli.ts read --svo > new-model.svo`
4. Add a new entry to `data/servo_catalog.json` with the model id
5. If you have the `.sfw` firmware files for the new model, compute
   their SHA-256 and add them to the catalog `bundled_firmware`
6. Open a PR

We'll add this as a documented workflow in #14 once v1.0 ships.

## Contributing decompilation work

If you have time on a Windows machine with Ghidra installed, the most
useful thing you could do right now is help complete the byte mapping
in [#7](https://github.com/caryden/servo-programmer/issues/7). The
research artifacts (decomp source files, wire captures) are all under
`research/`. Read `docs/BYTE_MAPPING.md` for context and the to-do list.

## Code of conduct

Be kind. Assume positive intent. If you're not sure whether something
is appropriate, ask before doing it.

## Questions

Open an issue with the `question` label, or drop into the project's
GitHub Discussions tab if it's enabled.
