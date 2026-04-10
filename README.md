# servo-programmer

> Cross-platform CLI replacement for the Axon Robotics Servo Programming
> Software, built from scratch by reverse-engineering a closed HW/SW
> system with [Claude Code](https://claude.com/claude-code), a Saleae
> Logic 8, and Ghidra.
>
> This started as a research experiment — *"how far can a single
> developer get with a coding agent on a reverse-engineering project
> against a closed system?"* — and ended with a working CLI. The full
> story is in [docs/the-adventure.md](docs/the-adventure.md).

[![CI](https://github.com/caryden/servo-programmer/actions/workflows/ci.yml/badge.svg)](https://github.com/caryden/servo-programmer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What this is

Axon Robotics sells smart servos (Mini, Max, Micro) used by a lot of
FTC robotics teams. You configure them — range, center, direction,
deadband, PWM power — with a small USB dongle that clips onto the
servo's signal wire. The dongle is the only way to touch the servo's
settings, and the vendor's configuration software is a 32-bit
Windows-only `.exe`. If you run macOS or Linux, you're out of luck.

`axon` is a cross-platform replacement: a single TypeScript CLI on
[Bun](https://bun.sh) that talks to the same dongle, reads and writes
the same 95-byte config block, and flashes the same vendor firmware.
Same hardware, same results, no Windows VM.

## Features

Shipping in v1.0:

- **Presence and diagnostics** — `axon status` (one-shot) and
  `axon monitor` (live 300 ms polling).
- **Full config round-trip** — `axon read` (human / `--json` / `--svo`
  / `--hex`) and `axon write --from cfg.svo` with diff, confirm, and
  read-back verify. Vendor `.svo` files work unmodified.
- **Named parameters with unit conversion** — `axon get <param>` and
  `axon set <param> <value>` accept degrees, microseconds, percent, or
  raw, and validate against per-model limits. `axon set default`
  resets to bundled defaults.
- **Firmware mode flashing** — `axon mode set standard`,
  `axon mode set continuous`, or `axon mode set --file custom.sfw`.
  `.sfw` files are decrypted internally; you never see the AES layer.
- **`--json` everywhere** — every command has a machine-readable mode
  for scripting and [coding-agent use](#using-this-with-a-coding-agent).
- **Cross-platform, no sudo** — Mac (Intel + Apple Silicon), Linux
  (x64 + ARM64), Windows, via
  [node-hid](https://github.com/node-hid/node-hid) on top of the OS
  HID framework.
- **Embedded servo catalog** — per-model defaults, parameter metadata,
  and vendor firmware SHA-256s live in
  [`data/servo_catalog.json`](data/servo_catalog.json) and ship inside
  the binary.

Full command surface: [docs/CLI_DESIGN.md](docs/CLI_DESIGN.md).

## Quick start

```bash
# 1. Install Bun if you don't have it
curl -fsSL https://bun.sh/install | bash

# 2. Clone, install dependencies, run
git clone https://github.com/caryden/servo-programmer
cd servo-programmer/axon
bun install
bun run src/cli.ts status
```

With the dongle plugged in and an Axon Mini connected you should see:

```
adapter  connected
servo    present
model    SA33**** (Axon Mini)
docs     https://docs.axon-robotics.com/servos/mini
```

No `sudo` required on any platform.

## Supported servos

| Model ID   | Name       | Status |
|------------|------------|--------|
| `SA33****` | Axon Mini  | Confirmed working — full parameter defaults in the catalog |
| *unknown*  | Axon Max   | Firmware bundled (SHA-256 recorded); model ID and defaults pending a physical read |
| *unknown*  | Axon Micro | Firmware bundled (SHA-256 recorded); model ID and defaults pending a physical read |

**Got a Max or Micro?** Please help fill out the catalog. Plug it in,
run `bun run src/cli.ts read --svo > my-model.svo`, and
[open an issue](https://github.com/caryden/servo-programmer/issues/new)
with the file attached and the model ID string from `axon status`.
I'll add your model's defaults to
[`data/servo_catalog.json`](data/servo_catalog.json) and credit you in
[CHANGELOG.md](CHANGELOG.md).

## How it was built

The whole thing is a research experiment: a single developer plus a
coding agent (Claude Code), pointed at a closed vendor stack, to see
how far the pair could get. The agent drove the tools — Ghidra,
libusb, hidapi, the Saleae automation API, ETW captures in a Parallels
Windows VM — and I supplied hardware, architectural choices, and the
occasional "wait, that's wrong."

The path:

1. **Static analysis in Ghidra** recovered the `.sfw` firmware format:
   a Brian Gladman AES-128 reference implementation with a hardcoded
   16-byte key of `"TTTTTTTTTTTTTTTT"`, found by walking backwards
   from the `Error 1030: Firmware is incorrect.` string.
2. **A Saleae Logic 8 on the servo signal wire** recovered the on-wire
   framing: 9600-baud 8N1 Dynamixel v1, with the standard
   `FF FF <id> <len> ...` header and a one-byte checksum.
3. **Dual capture** (libusb and the Saleae sampling simultaneously)
   proved the dongle is a transparent HID-to-wire proxy — every byte
   written to HID interface 1 shows up unchanged on the serial line.
4. **A libusb detour** chasing what looked like a transport bug turned
   out to be a misdiagnosed protocol bug. We pivoted back to plain
   hidapi, which is simpler, has no sudo requirements, and worked on
   the first try.
5. **A clean v1.0 CLI** on Bun + node-hid, with the catalog embedded
   at build time and `.sfw` files decrypted internally.

Most of the hands-on work — Ghidra scripting, protocol decoding,
TypeScript scaffolding, tests — was driven by the agent. The full
first-person write-up, including every dead end, is in
[docs/the-adventure.md](docs/the-adventure.md).

## Documentation

- [docs/the-adventure.md](docs/the-adventure.md) — first-person story of how this was built (long-form)
- [docs/CLI_DESIGN.md](docs/CLI_DESIGN.md) — the v1 command surface
- [docs/wire-protocol.md](docs/wire-protocol.md) — USB HID and on-wire protocol reference
- [docs/BYTE_MAPPING.md](docs/BYTE_MAPPING.md) — byte offset → parameter mapping
- [docs/licenses.md](docs/licenses.md) — dependency license audit
- [research/](research/) — captures, decompiled exe output, Python test scripts used during reverse engineering
- [vendor/](vendor/) — vendor-supplied assets (not part of the MIT-licensed source tree)
- [CHANGELOG.md](CHANGELOG.md) — release notes

## Using this with a coding agent

Every `axon` command has a `--json` mode and a stable exit-code
contract, so agents (Claude Code, Cursor, etc.) can drive it without
screen scraping. Start with [docs/CLI_DESIGN.md](docs/CLI_DESIGN.md)
for the command surface and exit codes, and
[docs/wire-protocol.md](docs/wire-protocol.md) if you need transport
details. A dedicated bundled agent skill is tracked in
[issue #16](https://github.com/caryden/servo-programmer/issues/16).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The most useful contribution
right now is **physical hardware testing on Axon Max and Axon Micro
servos** to fill in their catalog entries (see above). Bug reports
and protocol-edge-case `.sal` captures also very welcome.

## Acknowledgments

- **Axon Robotics** for making genuinely cool hardware. This project
  is a workaround for a Windows-only exe, not a complaint about the
  servos.
- **The FTC robotics community** for the use case.
- **[Saleae](https://www.saleae.com/)** for a logic analyzer with an
  automation API that made the dual-capture experiment cheap enough
  to try.
- **[Ghidra](https://ghidra-sre.org/)** for making the static-analysis
  phase possible at all.
- **The [libusb](https://libusb.info/),
  [hidapi](https://github.com/libusb/hidapi),
  [node-hid](https://github.com/node-hid/node-hid), and
  [Bun](https://bun.sh) maintainers** for the open infrastructure
  this sits on top of.
- **Anthropic** and **[Claude Code](https://claude.com/claude-code)**
  for the agent that drove most of the hands-on work. This project
  would not exist in its current form without it.

## License

[MIT](LICENSE).

The Axon Robotics vendor binaries (`.sfw` firmware files, the Windows
`.exe`) are **not** redistributed with this project. They're
downloadable from
[docs.axon-robotics.com](https://docs.axon-robotics.com/archive/programmer)
— you obtain them yourself and place them where the build looks for
them. See [vendor/README.md](vendor/README.md) for the expected
layout.
