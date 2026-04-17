# Dependency licenses

This document audits the licenses of every dependency that ends up
in the `servo-programmer` distribution and confirms they are
compatible with the project's MIT license.

The audit was generated on 2026-04-09 from the dependency tree of
`apps/cli/package.json` at commit `4963ab1`, using `bun pm ls --all`.

## Summary

- [x] All runtime dependencies are MIT-compatible: **yes**
- [x] All dev dependencies are MIT-compatible: **yes**
- [x] Total runtime packages (transitive): **4**
- [x] Total dev packages (transitive): **29**
- [x] Project license: **MIT** (see [LICENSE](../LICENSE))

## Runtime dependencies (shipped in the binary)

Only `node-hid` is declared in `dependencies`. Its transitive closure
pulls in `node-addon-api` and `pkg-prebuilds`, plus the vendored C
library `hidapi` that ships inside the `node-hid` tarball.

| Package | Version | License | Source | MIT compatible? |
|---|---|---|---|---|
| node-hid | 3.3.0 | MIT OR X11 | https://github.com/node-hid/node-hid | yes |
| node-addon-api | 3.2.1 | MIT | https://github.com/nodejs/node-addon-api | yes |
| pkg-prebuilds | 1.0.0 | MIT | https://github.com/julusian/pkg-prebuilds | yes |
| hidapi (vendored in node-hid) | bundled | GPL-3.0 OR BSD-3-Clause OR original-HIDAPI | https://github.com/libusb/hidapi | yes, under BSD |

### Note on `hidapi`

`hidapi` is tri-licensed: the user may choose GPL-3.0, a BSD-style
license, or the original permissive HIDAPI license. See
`node_modules/node-hid/hidapi/LICENSE.txt`. We use it under the
**BSD-3-Clause** option, which is MIT-compatible. The BSD-3-Clause
attribution clause requires reproducing the copyright notice in binary
distributions; the notice will be carried in the third-party notices
shipped alongside the compiled binary in release artifacts.

### Note on `node-hid` "MIT OR X11"

The `license` field in `node-hid`'s `package.json` literally reads
`(MIT OR X11)`. The X11 license is substantively identical to MIT;
the project is safe under either.

## Dev dependencies (build/test only)

These are only used during `bun build` / `bun test` and are not
embedded in the compiled binary. They still need to be permissive
enough for us to use them during development.

| Package | Version | License | MIT compatible? |
|---|---|---|---|
| @biomejs/biome | 2.4.11 | MIT OR Apache-2.0 | yes |
| @biomejs/cli-\* (9 per-platform packages) | 2.4.11 | MIT OR Apache-2.0 | yes |
| @types/bun | 1.3.11 | MIT | yes |
| @types/node | 25.5.2 | MIT | yes |
| bun-types | 1.3.11 | MIT | yes |
| typescript | 5.9.3 | Apache-2.0 | yes |
| undici-types | 7.18.2 | MIT | yes |
| ansi-regex | 5.0.1 | MIT | yes |
| ansi-styles | 4.3.0 | MIT | yes |
| cliui | 8.0.1 | ISC | yes |
| color-convert | 2.0.1 | MIT | yes |
| color-name | 1.1.4 | MIT | yes |
| emoji-regex | 8.0.0 | MIT | yes |
| escalade | 3.2.0 | MIT | yes |
| get-caller-file | 2.0.5 | ISC | yes |
| is-fullwidth-code-point | 3.0.0 | MIT | yes |
| require-directory | 2.1.1 | MIT | yes |
| string-width | 4.2.3 | MIT | yes |
| strip-ansi | 6.0.1 | MIT | yes |
| wrap-ansi | 7.0.0 | MIT | yes |
| y18n | 5.0.8 | ISC | yes |
| yargs | 17.7.2 | MIT | yes |
| yargs-parser | 21.1.1 | ISC | yes |

The `yargs` family comes in transitively via `bun-types`; none of it is
bundled into the compiled `axon` binary. Only the `@biomejs/cli-*`
package matching the host platform is ever installed (the others are
optional dependencies listed by `bun pm ls` but not unpacked).

## Special cases

### Vendor binaries (downloaded by user, NOT redistributed)

The Axon Robotics vendor files — `Axon_Servo_Programming_Software_v1.0.5.exe`,
the four `.sfw` firmware files, and the user's `.svo` config dumps — are
**not** redistributed in this repository. They are downloaded by the user
from [docs.axon-robotics.com](https://docs.axon-robotics.com/archive/programmer)
into the gitignored `downloads/` directory (see `.gitignore`). They remain
subject to Axon Robotics' own terms, and this project makes no licensing
claim over them. The sole exception is `vendor/samples/mini.svo`, a tiny
user-generated configuration dump committed as a reference fixture; it
contains no vendor code.

### Reverse-engineering research artifacts

Files under `research/static-analysis/ghidra_out/` are decompiled output
derived from the vendor `.exe`. Files under `research/decrypted-firmware/`
are decrypted plaintexts derived from the vendor `.sfw` files. Both are
research artifacts kept in-tree for reproducibility of the
reverse-engineering work. They are **derived works** of the Axon vendor
binaries and are therefore **not** covered by this project's MIT license;
they should not be redistributed as standalone artifacts outside the
context of this research repository.

### Tools used during research (not in the build chain)

These tools were used during reverse engineering but are not part of the
`servo-programmer` build, are not bundled, and are not redistributed:

- **Ghidra** (NSA, Apache-2.0) — static analysis / decompilation
- **Saleae Logic 2** (proprietary, vendor EULA) — logic-analyzer capture software
- **libusb** (LGPL-2.1) — used indirectly via `hidapi` during research only
- **hidapi** (tri-licensed, see runtime section) — also used as a standalone library during Python prototyping
- **Bun** (MIT) — the runtime and build tool
- **Parallels Desktop** (proprietary) — Windows VM for running the vendor exe
- **Anthropic Claude Code** — developer assistant

Credits for these tools will be included in the launch blog post
(tracked in issue #13). They require no entry in this audit because
they are not shipped with the binary.

## Action items

**None — all clear for MIT release.** Every runtime and dev dependency
is MIT-compatible. The only item that required closer reading was the
tri-licensed `hidapi` vendored inside `node-hid`; we use it under
BSD-3-Clause, and a third-party notices file will be included in
release artifacts to satisfy its attribution clause.
