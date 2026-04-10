# Axon CLI — v1 design

Replacement for the Windows-only Axon Servo Programming Software, with
two deliverables sharing the same core library:

1. A cross-platform CLI (`axon`) that's agent-friendly and scriptable.
2. A cross-platform desktop app (Electrobun) that wraps the same
   core for users who want a GUI.

This document scopes v1 to **"the common things done well."** Things
the vendor exe surfaces as clicks or file menus are first-class CLI
verbs; everything that's internal protocol plumbing stays internal.

## Global shape

```
axon [--json] [--quiet] [--yes] <command> [args...]
```

| Flag | Meaning |
|---|---|
| `--json` | Machine output. All commands produce JSON on stdout; errors go to stderr. |
| `--quiet` | Suppress headers/decoration. Raw values only. |
| `--yes` / `-y` | Skip confirmation prompts on destructive operations. |

**One dongle only.** If zero or more than one Axon dongle is present
on USB, the CLI exits with code 2 and a descriptive message. There
is no `--device` flag — the Axon hardware ecosystem does not support
multiple programmers on the same host.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Usage error (bad flags, unknown command) |
| 2 | Dongle not found, or more than one dongle present |
| 3 | Dongle not primed (servo reports absent — user needs to replug) |
| 4 | Servo I/O error (HID or wire transport failed mid-operation) |
| 5 | Validation error (invalid config, out-of-range parameter, bad file) |
| 6 | Unknown servo model (model ID not in bundled catalog) |

## Commands (v1)

### Presence and diagnostics

```
axon status                  # one-shot check
axon monitor                 # live presence polling, Ctrl-C to stop
```

`axon status --json`:
```json
{
  "adapter": "connected",
  "servo":   "present",
  "model":   {"id": "SA33***", "name": "Axon Mini"},
  "firmware":{"mode": "standard", "version": "1.0.5"}
}
```

### Read

```
axon read                    # pretty human view, with units
axon read --json             # machine-readable full model
axon read --svo > cfg.svo    # raw 95-byte vendor-compatible dump
```

`axon read`:
```
Axon Mini (SA33***)                        mode: standard   fw: 1.0.5
Docs: https://docs.axon-robotics.com/servos/mini
─────────────────────────────────────────────────────────────────────
range         260° / 355° max              (default 260°)
center        177.5°                        (default 177.5°)
direction     normal
deadband      2 µs
speed limit   100%
```

### Write

```
axon write --from cfg.json        # load JSON, show diff, confirm, write
axon write --from cfg.svo         # load raw .svo, same flow
axon write --from -               # read JSON from stdin
axon write --dry-run              # show diff only
```

`axon write` always shows a diff before committing unless `--yes`:

```
The following parameters will change:
  range      260° → 180°
  direction  normal → reversed
Proceed? [y/N]
```

After writing, the CLI reads back and verifies. Any mismatch is a
hard error (exit code 4).

### Get / set

```
axon get                          # list all parameter names (discovery)
axon get <param>                  # show one value
axon get <param> --json           # {"value": 260, "unit": "deg", ...}

axon set <param> <value>          # read-modify-write with diff+confirm
axon set <param> default          # reset one param to its model default
axon set default                  # reset all params to model defaults
axon set default --backup cfg.json  # save current config first
```

Accepted value units (CLI auto-converts from whichever the user supplies):

| Parameter kind | Accepts | Stored as |
|---|---|---|
| Angular | `deg`, `°`, `%` of max, `--raw` 0–255 | `deg` |
| Time/pulse | `us`, `µs`, `ms`, `--raw` | `us` |
| Discrete | named enum (e.g. `normal`, `reversed`) | string |

Out-of-range values are rejected with exit code 5 and a message
explaining the valid range for the current servo model.

`axon set <param> <value>` is a shorthand for read→modify→write, with
the same diff-and-confirm flow as `axon write`. There is no
standalone "modify then commit later" state — the CLI never holds a
dirty config in memory across invocations.

### Mode (firmware flashing)

```
axon mode list                    # bundled and discovered .sfw files
axon mode current                 # which mode is this servo running?
axon mode set <mode>              # flash bundled mode by name
axon mode set --file custom.sfw   # flash a user-supplied .sfw
```

`axon mode set` is **the only destructive operation with no undo.**
It displays a prominent warning, requires confirmation (even with
`--yes` it still requires the mode name to match what's currently
selected in an extra "are you sure" prompt), and verifies the flash
afterward.

`.sfw` decryption is handled internally — the user never sees
"decrypt" as a CLI verb. Users who need to inspect an `.sfw` file
for debugging can use `axon debug decrypt-sfw <file>` but that
subcommand is hidden from `--help` unless `AXON_DEV=1` is set.

**Firmware file discovery precedence for `axon mode set <name>`:**

1. `$AXON_FIRMWARE_PATH` — colon-separated user directories
2. `~/.config/axon/firmware/` — future auto-download cache (not v1)
3. Bundled-at-build-time — the canonical Axon `.sfw` files embedded
   in the binary, selected by the current catalog's
   `bundled_firmware` entry for the detected servo model.

`axon mode set --file <path>` bypasses all of the above.

## Servo catalog

Bundled as `data/servo_catalog.json`, embedded in the binary at
build time, versioned in-repo so it can evolve independently of
code. The catalog is the single source of truth for:

- Per-model metadata (name, max range, pulse range, docs URL)
- Per-model parameter defaults (for `axon set default`)
- Per-parameter metadata (unit, description, docs URL)
- Bundled firmware mapping with SHA-256 checksums

On unknown model ID (byte range `0x40..0x47` of the config block),
the CLI exits with code 6 and points the user at a
"please-file-an-issue" URL so we can learn about new models. See
`data/servo_catalog.json` for the schema.

## Explicitly NOT in v1

These are hidden from the `--help` output and live under
`axon debug ...` (dev-only) or are simply absent:

| Feature | Reason |
|---|---|
| `axon self-test` | Low value; scoped out for v1 |
| `axon reset --factory` | Redundant with `axon set default` |
| `axon watch <param>` | Nice-to-have; not critical for v1 |
| `axon shell` (REPL) | Nice-to-have; not critical for v1 |
| `axon debug decrypt-sfw` | Dev-only, hidden unless `AXON_DEV=1` |
| Raw HID framing access | Internal to the protocol module |
| Saleae integration | Dev-only, stays in `tools/` |
| Multiple dongle support | Not needed, enforced absent |
