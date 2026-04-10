# servo-programmer

> A cross-platform CLI replacement for the Axon Robotics Servo Programming
> Software, built end-to-end from scratch by reverse-engineering a closed
> HW/SW system using [Claude Code](https://claude.com/claude-code), a
> Saleae Logic 8, and Ghidra.
>
> **This is a research experiment** as much as it is a tool. The point was
> to see how far an agent could take a single developer through a hardware
> reverse-engineering project against a closed system. The full first-person
> story will live in [docs/the-adventure.md](docs/the-adventure.md) (in
> progress — see [issue #10](https://github.com/caryden/servo-programmer/issues/10)).

> [!NOTE]
> This README is a baseline stub. The polished version with screenshots,
> a feature matrix, and the supported-servos table lands as part of the
> v1.0 release plan in [issue #13](https://github.com/caryden/servo-programmer/issues/13).
> The current state of the project is **v0.1 — working CLI for read /
> write of the full 95-byte config block**, no named parameters yet.

## Status

[![CI](https://github.com/caryden/servo-programmer/actions/workflows/ci.yml/badge.svg)](https://github.com/caryden/servo-programmer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Working today (`bun run src/cli.ts <command>` from `axon/`, no sudo on any platform):

- `axon status` — adapter + servo presence, model id, firmware mode
- `axon monitor` — live presence polling at 300 ms cadence (Ctrl-C to stop)
- `axon read` — pretty / `--json` / `--svo` / `--hex`
- `axon write --from cfg.svo` — diff, confirm, write, verify

Coming in v1.0 (see the [milestones](https://github.com/caryden/servo-programmer/milestones)):

- `axon get <param>` / `axon set <param> <value>` with named parameters
  and unit conversion (degrees, microseconds, percentage, raw)
- `axon mode set <name>` — flash bundled firmware modes (standard,
  continuous rotation), or a user-supplied `.sfw`
- An [agent skill](.claude/skills/) so coding agents can drive the CLI
  on their own
- Cross-compiled standalone binaries for Mac (Intel + Apple Silicon),
  Linux (x64 + ARM64), and Windows

## What is this?

The Axon Robotics servo programmer is a USB dongle that connects to Axon
servos (Mini, Max, Micro) and lets you read and write the servo's
configuration block (range, center, direction, deadband, etc.) and flash
different firmware modes (standard PWM vs continuous rotation). The
vendor's official software is Windows-only, which is awkward for FTC
robotics teams running Mac or Linux.

This project reverse-engineers the dongle's USB protocol and the on-wire
servo protocol from scratch and replaces the vendor exe with a small
cross-platform CLI written in TypeScript on Bun.

## Quick start

```bash
# Install Bun if you don't have it
curl -fsSL https://bun.sh/install | bash

# Clone, install dependencies, run the CLI
git clone https://github.com/caryden/servo-programmer
cd servo-programmer/axon
bun install
bun run src/cli.ts status
```

Expected output (with the dongle plugged in and an Axon Mini connected):

```
adapter  connected
servo    present
model    SA33**** (Axon Mini)
docs     https://docs.axon-robotics.com/servos/mini
```

## Documentation

- [docs/CLI_DESIGN.md](docs/CLI_DESIGN.md) — the v1 command surface
- [docs/FINDINGS.md](docs/FINDINGS.md) — protocol reference (will be polished and renamed to `wire-protocol.md` in [issue #9](https://github.com/caryden/servo-programmer/issues/9))
- [docs/BYTE_MAPPING.md](docs/BYTE_MAPPING.md) — byte offset → parameter mapping
- [research/](research/) — all the captures, scripts, and decompiled exe artifacts used during the reverse-engineering session
- [vendor/](vendor/) — vendor-supplied assets (not part of the MIT-licensed source tree)
- The plan to v1.0 lives in the [v0.2-clean-baseline](https://github.com/caryden/servo-programmer/milestone/1) and [v1.0](https://github.com/caryden/servo-programmer/milestone/2) milestones

## How it was built

This whole project was built in a small number of sessions with Claude
Code — me describing what I wanted, the agent driving Ghidra, libusb,
hidapi, the Saleae logic analyzer's automation API, ETW captures from a
Parallels Windows VM, and writing the final TypeScript CLI. The full
write-up is the in-progress [docs/the-adventure.md](docs/the-adventure.md).

## License

[MIT](LICENSE).

The Axon Robotics vendor binaries (`.sfw` firmware files, the Windows
exe) are NOT redistributed with this project. They're available from
[docs.axon-robotics.com](https://docs.axon-robotics.com/archive/programmer)
— you obtain them yourself.

## Acknowledgments

- **Axon Robotics** for making cool hardware
- **The FTC robotics community** for the use case
- **Saleae** for an automation API that made the dual-capture experiment cheap
- **Ghidra** for the decompiler
- **The libusb, hidapi, node-hid, and Bun maintainers** for the open infrastructure
- **Anthropic / Claude Code** for the agent that drove most of the work
