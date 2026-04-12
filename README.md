# servo-programmer

> Cross-platform CLI replacement for the legacy Axon Robotics Servo
> Programming Software, built from scratch by reverse-engineering a
> closed HW/SW system with [Claude Code](https://claude.com/claude-code),
> a Saleae Logic 8, and Ghidra.
>
> This started as a research experiment — *"how far can a single
> developer get with a coding agent on a reverse-engineering project
> against a closed system?"* — and ended with a working CLI. The full
> story is in [docs/the-adventure.md](docs/the-adventure.md).

[![CI](https://github.com/caryden/servo-programmer/actions/workflows/ci.yml/badge.svg)](https://github.com/caryden/servo-programmer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What this is

Axon Robotics sells smart servos (Mini, Max, Micro) used by a lot of
FTC robotics teams. The original programmer adapter clips onto the
servo's signal wire and exposes the servo's settings through a
Windows-only `.exe`. This repo targets that legacy adapter/servo stack
today: bootloader v1.3 hardware and the archived `.sfw` firmware files
published for it.

`axon` is a cross-platform replacement: a TypeScript CLI on
[Bun](https://bun.sh) that talks to the same USB HID adapter, reads and
writes the same 95-byte config block, and flashes user-supplied vendor
`.sfw` firmware files. Same legacy hardware, no Windows VM.

The current Axon MK2 programmer/servo family uses bootloader v1.4 and
is not implemented yet. The HID/protocol layers are intentionally kept
separate so this project can be adapted if hardware becomes available.

## Features

Current source supports:

- **Presence and diagnostics** — `axon status` (one-shot),
  `axon monitor` (live 300 ms polling), and `axon doctor` for a
  non-destructive runtime/catalog/USB/HID/servo diagnostic report.
- **Config round-trip** — `axon read` (human / `--json` / `--svo` /
  `--hex`) and `axon write --from cfg.svo` with diff, confirm,
  model-id checks, and read-back verify. Vendor `.svo` files work
  unmodified.
- **Named parameters with unit conversion** — `axon get <param>` and
  `axon set <param> <value>` accept user-facing values such as
  microseconds, percentages, enum names, steps, and raw bytes, then
  validate against per-model limits. `axon set default` resets to
  catalog defaults.
- **Firmware mode flashing** — `axon mode set servo`,
  `axon mode set cr`, or `axon mode set --file custom.sfw`. Recovery
  flashing is available with `--recover` when a servo is stuck in the
  bootloader and cannot be identified normally.
- **External firmware files** — vendor `.sfw` files are not embedded or
  redistributed. `axon` finds user-supplied files in configured search
  paths, verifies their SHA-256 when known, and decrypts them
  internally.
- **`--json` support** — command output and top-level errors expose
  machine-readable fields, including stable error `category` values for
  scripting and [coding-agent use](#using-this-with-a-coding-agent).
- **Cross-platform, no sudo** — Mac (Intel + Apple Silicon), Linux
  (x64 + ARM64), Windows, via
  [node-hid](https://github.com/node-hid/node-hid) on top of the OS
  HID framework.
- **Embedded servo catalog** — per-model metadata, known defaults,
  parameter metadata, firmware filenames, and SHA-256s live in
  [`data/servo_catalog.json`](data/servo_catalog.json) and ship inside
  the binary.

Full command surface: [docs/CLI_DESIGN.md](docs/CLI_DESIGN.md).

## Quick start

```bash
# 1. Install Bun if you don't have it
curl -fsSL https://bun.sh/install | bash

# 2. Clone, install dependencies, run from source
git clone https://github.com/caryden/servo-programmer
cd servo-programmer/axon
bun install
bun run src/cli.ts status
```

With the dongle plugged in and an Axon Mini connected, `axon status`
prints a compact status bar plus the model docs link. For scripts and
agents, use JSON:

```bash
bun run src/cli.ts --json status
```

```json
{"adapter":"connected","servo":"present","category":"servo_present","mode_byte":"0x03","mode_label":"Servo Mode","model":{"id":"SA33****","name":"Axon Mini","known":true,"docs_url":"https://docs.axon-robotics.com/servos/mini"}}
```

No `sudo` required on any platform.

## Supported servos

| Model ID   | Name       | Catalog status |
|------------|------------|----------------|
| `SA33****` | Axon Mini  | Confirmed on hardware; full v1 parameter defaults and firmware hashes are cataloged |
| `SA20BHS*` | Axon Micro | Confirmed on hardware in CR mode; CR defaults and firmware hashes are cataloged, servo-mode defaults still need capture |
| `SA81BHMW` | Axon Max   | Model ID and firmware hashes are known from `.sfw` headers; physical config/default capture still needed |

**Got an Axon Max, another Micro capture, or an unknown model?** Please
help fill out the catalog. Plug it in, run
`bun run src/cli.ts read --svo > my-model.svo`, and
[open an issue](https://github.com/caryden/servo-programmer/issues/new)
with the file attached and the model ID string from `axon status`.
I'll add the model/defaults to
[`data/servo_catalog.json`](data/servo_catalog.json).

## Firmware files

This repo does not redistribute Axon `.sfw` firmware files. Download
the legacy programmer files from
[Axon's archive page](https://docs.axon-robotics.com/archive/programmer)
and either pass them explicitly:

```bash
axon mode set --file ~/Downloads/Axon_Mini_Servo_Mode.sfw
```

or place them in a firmware search directory:

1. `$AXON_FIRMWARE_PATH`
2. User firmware cache:
   - macOS: `~/Library/Application Support/axon/firmware`
   - Linux: `$XDG_DATA_HOME/axon/firmware` or `~/.local/share/axon/firmware`
   - Windows: `%LOCALAPPDATA%\Axon\firmware`
3. Repo-root `downloads/` when running from source

Then catalog mode changes can find and hash-check the files:

```bash
axon mode set servo
axon mode set cr
```

If a failed flash leaves a servo in bootloader mode, recovery flashing
skips normal identity/config reads and uses either the `.sfw` header or
an explicit catalog target:

```bash
axon mode set --file "$HOME/Downloads/Axon Micro Servo Mode.sfw" --recover
axon mode set servo --recover micro
```

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
5. **A clean CLI** on Bun + node-hid, with the catalog embedded at
   build time and externally supplied `.sfw` files decrypted
   internally.

Most of the hands-on work — Ghidra scripting, protocol decoding,
TypeScript scaffolding, tests — was driven by the agent. The full
first-person write-up, including every dead end, is in
[docs/the-adventure.md](docs/the-adventure.md).

## Documentation

- [docs/the-adventure.md](docs/the-adventure.md) — first-person story of how this was built (long-form)
- [docs/CLI_DESIGN.md](docs/CLI_DESIGN.md) — the v1 command surface
- [docs/INSTALL.md](docs/INSTALL.md) — install and build-from-source notes
- [docs/wire-protocol.md](docs/wire-protocol.md) — USB HID and on-wire protocol reference
- [docs/BYTE_MAPPING.md](docs/BYTE_MAPPING.md) — byte offset → parameter mapping
- [docs/logic-analyzers.md](docs/logic-analyzers.md) — low-cost logic analyzer options and Saleae notes
- [docs/licenses.md](docs/licenses.md) — dependency license audit
- [research/](research/) — captures, decompiled exe output, Python test scripts used during reverse engineering
- [vendor/](vendor/) — vendor-format samples and licensing notes
- [CHANGELOG.md](CHANGELOG.md) — release notes

## Using this with a coding agent

`axon` commands expose JSON output where useful, and top-level
`AxonError` failures include a stable `category` field in `--json`
mode. Agents and scripts should branch on that category rather than
screen-scraping human text. Start with
[docs/CLI_DESIGN.md](docs/CLI_DESIGN.md) for the command surface and
exit codes, and
[docs/wire-protocol.md](docs/wire-protocol.md) if you need transport
details. When setup or USB ownership is unclear, start with
`axon --json doctor`; it reports stable per-check IDs and categories.
The current direction is to keep the CLI self-explanatory enough for
both humans and agents: good `--help`, stable JSON, and direct error
messages with concrete suggestions rather than a repo-specific skill.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The most useful contribution
right now is **physical hardware testing on Axon Max and additional
Micro/unknown servos** to fill in catalog gaps (see above). Bug reports
and protocol-edge-case `.sal` captures are also welcome.

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
— you obtain them yourself and place them where the CLI searches, or
pass them with `--file`. See [vendor/README.md](vendor/README.md) for
licensing notes.
