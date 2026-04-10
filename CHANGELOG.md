# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `LICENSE` (MIT, copyright 2026 Carl Ryden) at repo root.
- `README.md` (baseline stub) at repo root with project tagline,
  research-experiment framing, current status, and quick start.
- `CHANGELOG.md` (this file) at repo root.
- `CONTRIBUTING.md` at repo root with the contributor workflow.

### Documented

- Plan to v1.0 broken into 18 GitHub issues across 3 milestones
  (`v0.2-clean-baseline`, `v1.0`, `post-v1.0`). See the
  [milestones page](https://github.com/caryden/servo-programmer/milestones).

## [0.1.0] — 2026-04-09 (un-tagged research checkpoint)

Initial reverse-engineering session captured as one squashed commit
(`61e2c41`). Not a formal release — there is no published binary at
this revision — but the working CLI runs from source.

### Added

- `axon/` Bun TypeScript CLI scaffold with status, monitor, read,
  write commands. Runs without sudo on macOS via node-hid.
- `data/servo_catalog.json` — bundled servo metadata catalog with
  Axon Mini confirmed (model id `SA33****`) and Max/Micro placeholders.
- `docs/FINDINGS.md` — comprehensive wire-protocol and HID reply
  format writeup.
- `docs/CLI_DESIGN.md` — scoped v1 CLI surface (9 verbs).
- `docs/BYTE_MAPPING.md` — byte offset → parameter mapping with
  confirmed entries from the vendor exe decomp and a to-do for the
  remaining offsets.
- `docs/SESSION_2026-04-09_VM_PROBE.md` — Parallels / ETW investigation
  notes.
- `tools/axon_libusb_test{,2,3,4,5,6,7}.py` — seven progressively
  smarter libusb experiments that led to the final working protocol
  understanding.
- `tools/axon_libusb_test_monitor.py`, `tools/axon_libusb_test_status.py`
  — simple live presence monitors using the final pattern.
- `tools/axon_hid_test_probe.py` — the 5-minute hidapi retest that
  proved libusb was never actually needed and unlocked the sudo-free CLI.
- `tools/decode_saleae_csv.py` — frame-aware Async Serial decoder.
- `tools/{install,uninstall}_sudoers.sh` and
  `tools/axon-sudoers-rules.txt` — narrow NOPASSWD rule for the
  legacy libusb research scripts.
- `tools/ghidra_out/` — decompiled exe functions including the two
  UI overlays (FUN_00405518, FUN_00406248), the chunked read/write
  helpers (FUN_004047d0, FUN_00404900), and the AES-decrypt path for
  `.sfw` firmware files.
- `tools/ghidra_scripts/` — Jython scripts driving `analyzeHeadless`.
- `samples/saleae/*.csv` — multiple decoded wire captures including
  the `0xCD` read button click, the `0xCB` write button click, and
  the final dual libusb + Saleae capture.
- `samples/axon-usb.{etl,xml}` — ETW USB trace from the vendor exe
  in Parallels on Windows 11 ARM.
- `samples/mini.svo`, `samples/decrypted/` — captured config block
  and decrypted `.sfw` firmware plaintexts.

### Discovered (the protocol)

- USB descriptor: VID `0x0471` PID `0x13AA`,
  `iManufacturer="Stone Laboratories inc."`,
  `iProduct="USBBootloader V1.3"`, HID class with 64-byte reports
  on Report ID `0x04`.
- HID command set: `0x8A` identify, `0xCD` read config, `0xCB` write
  config, with `rx[1]==0x01 && rx[2]==0x00` as the success gate.
- Wire protocol: Dynamixel-v1-like framing
  `FF FF | ID | LEN | INSTR/ERR | PARAMS | CHKSUM` at **9600 baud
  8N1**, with checksum = bitwise NOT of the running sum.
- 95-byte config block transported in two chunks:
  `(addr=0x00, len=0x3B)` + `(addr=0x3B, len=0x24)`. Identical to
  vendor `.svo` file format.
- `.sfw` firmware files: AES-128 with fixed key `"TTTTTTTTTTTTTTTT"`
  (16 × `0x54`), header ECB-decrypted, payload CBC-decrypted with
  IV=0, decrypted contents are Intel HEX.
- Dongle has a "primed / cold" state machine. The plug-in order
  rule is **adapter first, then servo**. `dev.reset()` (libusb)
  wipes primed state and is therefore destructive — never call it.

[Unreleased]: https://github.com/caryden/servo-programmer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/caryden/servo-programmer/releases/tag/v0.1.0
