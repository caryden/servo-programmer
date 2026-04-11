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

In `--json` mode, `AxonError` failures are written to stderr as:

```json
{"error":"...","code":1,"category":"usage","hint":"..."}
```

Scripts and agents should branch on `category`, not on human-readable
message text.

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
axon doctor                  # staged runtime/catalog/USB/HID/servo diagnostics
axon monitor                 # live presence polling, Ctrl-C to stop
```

`axon status --json`:
```json
{
  "adapter": "connected",
  "servo": "present",
  "category": "servo_present",
  "mode_byte": "0x03",
  "mode_label": "Servo Mode",
  "model": {
    "id": "SA33****",
    "name": "Axon Mini",
    "known": true,
    "docs_url": "https://docs.axon-robotics.com/servos/mini"
  }
}
```

`axon doctor` runs a longer, non-destructive check sequence:

1. CLI/runtime version and platform
2. Servo catalog and external firmware manifest
3. USB/HID adapter visibility at VID `0x0471` PID `0x13aa`
4. HID openability, including likely VM/vendor-app ownership failures
5. Safe identify probe
6. Safe config read probe for model ID and catalog match

Default output is a concise check report. `axon doctor --json` emits:

```json
{
  "ok": true,
  "category": "ok",
  "checks": [
    {"id": "runtime", "status": "pass", "category": "runtime"},
    {"id": "catalog", "status": "pass", "category": "catalog"},
    {"id": "usb_hid", "status": "pass", "category": "ok"},
    {"id": "hid_open", "status": "pass", "category": "ok"},
    {"id": "identify", "status": "pass", "category": "ok"},
    {"id": "config_read", "status": "pass", "category": "ok"}
  ]
}
```

Use `axon doctor --debug` to include raw identify and first config-read
HID reply prefixes for hardware/protocol debugging. The command always
exits 0 when it can produce a report; consumers should branch on the
top-level `category` and per-check `status`.

### Read

```
axon read                    # human-readable model + block summary
axon read --json             # machine-readable model + raw bytes
axon read --svo > cfg.svo    # raw 95-byte vendor-compatible dump
axon read --hex              # annotated hex dump for debugging
```

`axon read`:
```
model      SA33****  (Axon Mini)
docs       https://docs.axon-robotics.com/servos/mini
block      95 bytes (magic 3bd00bf6)
Named parameters not yet shown in v1 scaffold.
Use `axon read --svo > cfg.svo` to save the block, or
`axon read --hex` to see the raw byte layout.
```

### Write

```
axon write --from cfg.svo         # load raw .svo, same flow
axon write --from cfg.svo --dry-run  # show diff only
```

`axon write` supports vendor-compatible 95-byte `.svo` files in the
current CLI. JSON config files and stdin writes are reserved for a
future release.

`axon write` rejects empty or mismatched model IDs before showing a
diff. When the model ID matches, it always shows a byte-level diff
before committing unless `--yes`:

```
The following 2 byte(s) will change:
  0x04    0x82 → 0x80
  0x05    0x82 → 0x80
Write 2 byte(s) to servo? [y/N]
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
axon set default --backup cfg.svo   # save current raw config first
```

Accepted value units (CLI auto-converts from whichever the user supplies):

| Parameter kind | Accepts | Stored as |
|---|---|---|
| Raw byte | number 0–255 | raw byte |
| Pulse offset | `us`, `µs`, or a bare number | `us` |
| Percent | number or `%` suffix | percent |
| Step | integer step | step |
| Discrete | named enum (e.g. `normal`, `reversed`) | string |

Out-of-range values are rejected with exit code 5 and a message
explaining the valid range for the current servo model.

`axon set <param> <value>` is a shorthand for read→modify→write, with
the same diff-and-confirm flow as `axon write`. There is no
standalone "modify then commit later" state — the CLI never holds a
dirty config in memory across invocations.

### Mode (firmware flashing)

```
axon mode list                    # known and discovered .sfw files
axon mode current                 # which mode is this servo running?
axon mode set <mode>              # flash known mode by name: servo/cr/standard/continuous
axon mode set --file custom.sfw   # flash a user-supplied .sfw
axon mode set --file custom.sfw --recover
axon mode set servo --recover mini
```

`axon mode set` is **the only destructive operation with no undo.**
It displays a prominent warning, requires confirmation unless `--yes`
is passed, and verifies the flash afterward.

`.sfw` decryption is handled internally — the user never sees
"decrypt" as a CLI verb.

**Firmware file discovery precedence for `axon mode set <name>`:**

1. `$AXON_FIRMWARE_PATH` — platform-delimited user directories
   (`:` on macOS/Linux, `;` on Windows)
2. User firmware cache:
   - macOS: `~/Library/Application Support/axon/firmware`
   - Linux: `$XDG_DATA_HOME/axon/firmware` or `~/.local/share/axon/firmware`
   - Windows: `%LOCALAPPDATA%\Axon\firmware`
3. Repo-root `downloads/` when running from source

`axon mode set --file <path>` bypasses all of the above.

The CLI does **not** redistribute vendor `.sfw` files. The catalog
stores the expected filenames and SHA-256 values; the user obtains the
firmware from Axon's docs or supplies a custom file explicitly. This
matches the vendor app's flow and leaves room for future MK2/WebHID
support where firmware may come from a browser file picker or verified
remote manifest.

## Servo catalog

Bundled as `data/servo_catalog.json`, embedded in the binary at
build time, versioned in-repo so it can evolve independently of
code. The catalog is the single source of truth for:

- Per-model metadata (name, max range, pulse range, docs URL)
- Per-model parameter defaults (for `axon set default`)
- Per-parameter metadata (unit, description, docs URL)
- Known firmware mapping with SHA-256 checksums

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
| `axon debug decrypt-sfw` | Dev-only idea, not implemented in the CLI |
| Raw HID framing access | Internal to the protocol module |
| Saleae integration | Dev-only, stays in `research/static-analysis/` |
| Multiple dongle support | Not needed, enforced absent |
