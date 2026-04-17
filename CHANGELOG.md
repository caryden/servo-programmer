# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] — 2026-04-17

### Changed

- `axon read` now emits decoded named parameters by default in both
  human and `--json` output. The raw config block is no longer printed
  unless you explicitly request `--svo`, `--hex`, or `--debug`.
- Release binaries now build from the shared workspace packages used by
  the web and desktop apps, so the shipped CLI and the app protocol
  stacks stay aligned.

### Fixed

- Standalone release binaries now embed the platform-specific `node-hid`
  addon directly instead of relying on the package's dynamic
  `pkg-prebuilds` lookup, so compiled `axon` binaries can enumerate HID
  devices away from the build machine path.
- CLI mode switching and recovery flows now use the same shared flash
  engine as the app codepaths, including better progress reporting and
  safer firmware validation.

### Security

- Release-time firmware handling continues to require SHA-256-verified
  `.sfw` payloads before a mode change or recovery flash proceeds.

## [1.0.0] — 2026-04-12

### Added

- The full v1 CLI surface for the legacy Axon V1.3 programmer:
  `status`, `doctor`, `monitor`, `read`, `write`, `get`, `set`,
  `mode`, and `version`.
- Standalone release artifacts for macOS, Linux, and Windows via
  `.github/workflows/release.yml` and `scripts/build-release.sh`.
- `scripts/install.sh` plus `scripts/test-install.sh` for the
  direct-download install path on macOS and Linux.
- Public-facing protocol and operator docs in `docs/`, including
  `wire-protocol.md`, `BYTE_MAPPING.md`, `CLI_DESIGN.md`, and
  `INSTALL.md`.

### Changed

- Firmware mode flashing now uses external `.sfw` files from search
  paths or explicit `--file` input rather than bundling vendor
  firmware into the CLI binary.
- CLI guidance for humans and agents is now centered on `--help`,
  stable `--json` output, `AxonError.category`, and `axon doctor`
  instead of repo-specific agent glue.
- The catalog now includes Mini, Micro, and Max model coverage for
  the current reverse-engineered surface, with unresolved defaults
  left explicit rather than guessed.

### Removed

- The old libusb-era approach and its reset/claim footguns from the
  runnable CLI path. The released tool is HID-based and runs without
  sudo on supported platforms.

### Fixed

- Prompt handling no longer consumes stdin across repeated confirms.
- `write` now rejects empty or mismatched model IDs before showing a
  diff or touching a servo.
- `get` and `set` now fail clearly on unknown modes and unknown mode
  labels instead of degrading into misleading parameter errors.
- HID and protocol tests are now isolated from cross-test module-cache
  pollution on Windows and other CI runners.

### Security

- Unexpected stack traces are hidden by default and shown only when
  `AXON_DEBUG=1` is set.
- HID protocol reads reject truncated replies before slicing payloads.
- Catalog firmware lookup for mode detection uses own-property checks
  instead of prototype-inherited keys.
- Firmware resolution verifies SHA-256 before trusting catalog-backed
  `.sfw` files from search paths.

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
- `research/session-notes/SESSION_2026-04-09_VM_PROBE.md` — Parallels / ETW
  investigation notes.
- `research/python-tests/axon_libusb_test{,2,3,4,5,6,7}.py` — seven progressively
  smarter libusb experiments that led to the final working protocol
  understanding.
- `research/python-tests/axon_libusb_test_monitor.py`, `research/python-tests/axon_libusb_test_status.py`
  — simple live presence monitors using the final pattern.
- `research/python-tests/axon_hid_test_probe.py` — the 5-minute hidapi retest that
  proved libusb was never actually needed and unlocked the sudo-free CLI.
- `research/static-analysis/decode_saleae_csv.py` — frame-aware Async Serial decoder.
- `research/sudoers/{install,uninstall}_sudoers.sh` and
  `research/sudoers/axon-sudoers-rules.txt` — narrow NOPASSWD rule for the
  legacy libusb research scripts.
- `research/static-analysis/ghidra_out/` — decompiled exe functions including the two
  UI overlays (FUN_00405518, FUN_00406248), the chunked read/write
  helpers (FUN_004047d0, FUN_00404900), and the AES-decrypt path for
  `.sfw` firmware files.
- `research/static-analysis/ghidra_scripts/` — Jython scripts driving `analyzeHeadless`.
- `research/saleae-captures/*.csv` — multiple decoded wire captures including
  the `0xCD` read button click, the `0xCB` write button click, and
  the final dual libusb + Saleae capture.
- `research/etw-traces/axon-usb.{etl,xml}` — ETW USB trace from the vendor exe
  in Parallels on Windows 11 ARM.
- `vendor/samples/mini.svo`, `research/decrypted-firmware/` — captured config block
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

[Unreleased]: https://github.com/caryden/servo-programmer/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/caryden/servo-programmer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/caryden/servo-programmer/compare/61e2c41...v1.0.0
[0.1.0]: https://github.com/caryden/servo-programmer/tree/61e2c41
