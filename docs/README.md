# Documentation index

This directory holds the canonical, polished documentation for the
project. The unpolished research diary lives in
[../research/session-notes/](../research/session-notes/), and the
narrative version of the journey is in [the-adventure.md](the-adventure.md).

## If you're new

1. Start with [the-adventure.md](the-adventure.md) — the first-person
   story of how this was built. It's the most accessible entry point
   and ties everything else together.
2. Then read [CLI_DESIGN.md](CLI_DESIGN.md) for the command surface.
3. If you want to write code against the dongle from scratch, read
   [wire-protocol.md](wire-protocol.md) and [BYTE_MAPPING.md](BYTE_MAPPING.md).

## Reference

| Document | What it is |
|---|---|
| [the-adventure.md](the-adventure.md) | First-person narrative of the reverse-engineering journey. |
| [CLI_DESIGN.md](CLI_DESIGN.md) | The v1 axon CLI command surface, exit codes, output formats. |
| [wire-protocol.md](wire-protocol.md) | Authoritative reference for the HID and on-wire protocols. |
| [BYTE_MAPPING.md](BYTE_MAPPING.md) | Which byte of the 95-byte config block means what. |
| [licenses.md](licenses.md) | Dependency license audit and project licensing notes. |
| [../RELEASE.md](../RELEASE.md) | Maintainer release workflow: tag, build, draft release, validation, publish. |

## Where else to look

| Path | What's there |
|---|---|
| [../axon/](../axon/) | The axon CLI source code. |
| [../data/servo_catalog.json](../data/servo_catalog.json) | Bundled servo metadata catalog. |
| [../research/](../research/) | All the artifacts used during reverse engineering: captures, decompiled exe, Python test scripts. |
| [../vendor/](../vendor/) | Vendor-supplied files (firmware, sample configs). Not our code. |
