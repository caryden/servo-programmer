# vendor/

Files in this directory **are not our code**. They are vendor-supplied
or vendor-derived assets, kept here so the project's reverse-engineering
work is reproducible without re-fetching them every time.

## Contents

| Path | What it is | Source | Licensing |
|---|---|---|---|
| `samples/mini.svo` | A 95-byte raw config-block dump from an Axon Mini, captured by clicking "Save .svo" in the vendor exe | Vendor format, our capture | The bytes describe one specific servo's settings; the vendor `.svo` format itself is observed, not specified |

## What's NOT here

- **The vendor exe** (`Axon_Servo_Programming_Software_v1.0.5.exe`) and the **`.sfw` firmware files** (`Axon_Mini_Servo_Mode.sfw` etc.) are NOT redistributed in this repository. Download them yourself from [docs.axon-robotics.com/archive/programmer](https://docs.axon-robotics.com/archive/programmer) into the gitignored `downloads/` directory at the repo root if you need them.
- **The decrypted `.sfw` plaintexts** (`*.plain.bin`) live under [`../research/decrypted-firmware/`](../research/decrypted-firmware/) instead, because they're a derivative of our reverse-engineering work, not a vendor-supplied file.

## Why this directory exists at all

Three reasons:

1. The `.svo` capture is vendor-format and lets us round-trip vendor files through our CLI to prove byte-for-byte compatibility.
2. Keeping vendor-supplied content in a clearly-labeled `vendor/` directory makes the licensing situation obvious to anyone reading the repo: the project's MIT license covers the source code in `axon/`, `data/`, `docs/`, and `research/`, but does NOT cover anything in here.
3. Future vendor releases (new servo models, firmware updates) can be added here without polluting the source tree.

## Licensing note

The Axon Robotics vendor binaries (when downloaded by the user from the
vendor's site) are subject to the vendor's terms, not this project's
MIT license. We do not redistribute them and this project makes no
licensing claim over them.

The `.svo` file in `samples/` describes a specific servo's
configuration values. The bytes are user data, not vendor-licensed
code, but the file format itself was reverse-engineered from the
vendor exe — it's documented in
[`../docs/wire-protocol.md`](../docs/wire-protocol.md) as a 1:1 dump
of the on-wire 95-byte config block.
