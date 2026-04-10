# 95-byte config block — offset → parameter mapping

Single source of truth for which config-block byte means what. The
CLI's `axon get`/`axon set` implementations live on top of this
mapping. The mapping is authored by reading the vendor exe decomp
(primary) and cross-checked against `.svo` diffs (fallback).

**Protocol reminders:**
- The block is 95 bytes (`0x5F`), transported via two HID
  round-trips: `(addr=0x00, len=0x3B)` + `(addr=0x3B, len=0x24)`.
- On the wire it's identical — no encoding.
- `.svo` files are a raw dump of these 95 bytes, with no header.

## Source functions (Ghidra decomp, `research/static-analysis/ghidra_out/`)

| File | Purpose |
|---|---|
| `param_helper_READ_004047d0_FUN_004047d0.c` | Chunked read primitive (max 59 B/chunk, 25 ms between chunks, validates `rx[1] != 0 && rx[2] == 0`) |
| `param_helper_WRITE_00404900_FUN_00404900.c` | Chunked write primitive (same chunking, validates only `rx[1] != 0`) |
| `decomp_slider_overlay_0x352_00405518.c` | Primary UI→byte serializer. Writes ~25 bytes of the block. |
| `decomp_slider_overlay_0x357_00406248.c` | Secondary UI overlay. Touches `[0x12]`, `[0x25]` bits, `[0x36]` (called for a sub-panel / alt mode). |
| `decomp_param_caller_0040330c_arrival_0040330c.c` | Caller — reads from block into the UI on load. Mirrors the serializer, useful for cross-check. |

## Confirmed mapping (high confidence)

All offsets below come from line-by-line reads of
`FUN_00405518` and `FUN_00406248`.

| Offset    | Name / meaning                    | Encoding | Source |
|-----------|-----------------------------------|----------|--------|
| `0x00..0x03` | **Model magic** (4 bytes)      | One of 5 hardcoded quadruples selected by UI mode checkbox | `FUN_00405518` lines 42-87 |
| `0x04`    | UI widget `p1+0x358` (byte)       | Raw byte | `FUN_00405518` line 66, 75, 85 |
| `0x05`    | = `[0x04]` (same widget written twice) | Raw byte | `FUN_00405518` line 67, 76, 86 |
| `0x06`    | Center/trim — `p1+0x380` widget minus `0x80` | Signed offset from 0x80 | `FUN_00405518` line 193 |
| `0x0A..0x0B` | 16-bit BE from `p1+0x374` widget | BE u16 | `FUN_00405518` lines 217-218 |
| `0x0C`    | `(p1+0x378 widget + 1) * 0x10`    | 4-bit packed × 16 | `FUN_00405518` line 194 |
| `0x0F`    | `p1+0x370` widget minus `0x14`    | Raw byte | `FUN_00405518` lines 206, 210 |
| `0x11`    | `p1+0x370` widget                 | Raw byte | `FUN_00405518` line 209 |
| `0x12`    | `p1+0x370` widget (primary), OR `p1+0x3e4` widget (secondary overlay) | Raw byte — one panel wins depending on active mode | Both overlays |
| `0x13`    | `p1+0x370` widget                 | Raw byte | `FUN_00405518` line 208 |
| `0x25`    | **Flags byte** — 6+ toggles packed: bit 0x10 = `p1+0x35c`, bit 0x08 = `p1+0x364`, bit 0x04 = `p1+0x368`, bits 0x02/0x01 = `p1+0x360` (toggle pair), bit 0x80 = `p1+0x36c`, bits 0x60 = `p1+0x37c` 3-way selector | Bitfield | `FUN_00405518` various |
| `0x27..0x28` | BE u16 mirror of `[0x0A..0x0B]`  | Same widget written twice | `FUN_00405518` lines 221-222 |
| `0x29..0x2A` | BE u16 mirror of `[0x0A..0x0B]`  | " | `FUN_00405518` lines 225-226 |
| `0x2B..0x2C` | BE u16 mirror of `[0x0A..0x0B]`  | " | `FUN_00405518` lines 229-230 |
| `0x35..0x3A` | 6 bytes from float sliders (`p1+0x388`, `p1+0x390`, `p1+0x398`, `p1+0x384`, `p1+0x38c`, `p1+0x394`) — only written when `[0x25] & 0x80` (advanced mode) | Quantized float → byte | `FUN_00405518` lines 115-177 |
| `0x36`    | Also written by secondary overlay from `p1+0x3dc` | Raw byte | `FUN_00406248` line 29 |
| `0x40..0x47` | **Model ID string** (ASCII, `*` padding) | ASCII | Read-only, set by servo firmware |
| `0x5E`    | End sentinel / layout version   | `0x01` observed on Mini | TBD |

## Bytes set elsewhere (read by overlay but not written)

The primary overlay *reads* these into scratch state, so they are
set by some other function we haven't walked yet. These are all
parameters the exe's `FUN_0040330c` loader reads from on startup.

| Offset | Read as | Purpose |
|---|---|---|
| `0x08..0x09` | BE u16 (`DAT_007c523c = [0x08]<<8 + [0x09]`) | Unknown — likely another limit/range |
| `0x14` | Byte | Unknown |
| `0x15` | Byte | Unknown |
| `0x16` | Byte | Unknown |
| `0x17` | Byte | Unknown |
| `0x19..0x1A` | BE u16 | Unknown limit triple pt 1 |
| `0x1B..0x1C` | BE u16 | Unknown limit triple pt 2 |
| `0x1D..0x1E` | BE u16 | Unknown limit triple pt 3 |

## Fully unknown bytes

Bytes we have not seen referenced in any decomp so far and whose
purpose we don't know:

`0x07`, `0x0D`, `0x0E`, `0x10`, `0x18`, `0x1F`, `0x20..0x24`, `0x26`,
`0x2D..0x34`, `0x3B..0x3F`, `0x48..0x5D`.

Most of the `0x48..0x5D` range is zero in the live capture, so it
may be reserved / padding. `0x3B..0x3F` contains `23 e3 00 00 00`
which looks like a small bit of real data — possibly a
firmware-version or capability word.

## To-do before the CLI can implement `axon set <param>`

1. **Walk `FUN_0040330c` (the load side)** — it reads config bytes
   into UI widgets. That gives us the inverse of the overlays, and
   crucially it labels which widget is "Range", "Center", etc. by
   virtue of which VCL widget object it writes into. Cross-reference
   the widget object's label string against the exe's resource
   section.
2. **Walk `FUN_00403ffc`** — named by us as
   `decomp_param_read_read_caller_00403ffc` — it's a sibling caller
   and is larger (~230 lines); may contain more overlay logic.
3. **Identify widget-label strings.** The Delphi `TLabel::Caption`
   strings for each slider exist in `.rdata` — we have
   `004dc230_...TiLabelTSetCaption...c` as an entry point. Find the
   cross-references from that function to the widget object offsets
   (0x354, 0x358, 0x370, 0x374, 0x378, 0x380, 0x37c) and we'll have
   the mapping: offset → widget → label → human name.
4. **Once 1-3 are done, cross-check with `.svo` diffs.** Ask the
   user to save two `.svo` files per parameter — one before, one
   after — and diff. If the diff agrees with the decomp-based
   mapping, we're done. If it disagrees, the decomp interpretation
   is wrong and we investigate.

## Priority for filling in the catalog

For v1, the parameters we absolutely need (in priority order):

1. **range** — the primary user-facing knob. Likely `[0x0A..0x0B]`
   BE u16 (replicated at 0x27-0x2C). Strong candidate based on the
   "many internal limits set to the same value" pattern.
2. **center** — likely `[0x06]`, `[0x04]`, or `[0x05]`. The `+ 1500us`
   home position offset.
3. **direction** — one of the bits in `[0x25]` flags byte.
4. **deadband** — likely `[0x0C]` (the 4-bit packed field the user
   was seen changing).
5. **speed-limit / PID** — `[0x35..0x3A]` slab, activated by the
   advanced-mode flag.

Until the decomp walk is complete, `axon set range`/`center`/etc
will error out with an explanatory message pointing at this file,
but `axon read` / `axon write --from file.svo` / `axon write --from
file.json` (round-trip) will all work because they operate on the
whole 95-byte block without needing to know the per-parameter
semantics.
