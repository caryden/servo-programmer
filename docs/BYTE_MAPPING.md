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

## Confirmed mapping (v1.0 core five)

This is the authoritative byte→parameter mapping that the v1.0 CLI's
`axon get` and `axon set` commands implement against. Each entry was
extracted from the vendor exe decomp under
`research/static-analysis/ghidra_out/` by walking the UI→byte
serializer `FUN_00405518` and cross-referencing against the small
set of ASCII label strings (`'Damping Factor: '` at `007a734a`) and
VCL event-handler names (`'rztrNeutralChange'` at `007a9888`,
`'rztrDampingChange'` at `007a98b4`) found in `data_printable_runs.txt`.

The load-side function (`FUN_00404b28`) is called from
`decomp_param_caller_0040330c_arrival_0040330c.c:165` and
`00403ffc_FUN_00403ffc.c:208` and would give us a cleaner inverse,
but its decomp was not in `ghidra_out/` at the time of writing. The
mapping below is therefore sourced primarily from the overlay
serializer and then cross-checked against the live capture in
`research/saleae-captures/dual_test7_623.csv`.

| Parameter | Offset(s) | Encoding | Widget | Live raw | Live displayed | Confidence | Source |
|---|---|---|---|---|---|---|---|
| `range` | `0x0A..0x0B` (plus mirrors at `0x27..0x28`, `0x29..0x2A`, `0x2B..0x2C`) | BE u16 | `p1+0x374` | `0x0050` (80) | full range (Mini: ≈ 355°) | high | `decomp_slider_overlay_0x352_00405518.c` lines 211-230 |
| `center` | `0x06` | signed offset from `0x80` (stored = user + `0x80`) | `p1+0x380` ("rztrNeutral" TrackBar) | `0x80` | 0 (centered) | high | `decomp_slider_overlay_0x352_00405518.c` line 193 |
| `direction` | byte `0x25`, bit `0x02` (mask `0x02`) | bitfield (0 = normal, 1 = reversed) | `p1+0x360` (checkbox, XOR toggle into bit `0x01`) | `0x21` → bit 2 = 0 | normal | medium | `decomp_slider_overlay_0x352_00405518.c` lines 88-108 |
| `damping` (a.k.a. deadband slot) | `0x0C` | `stored = (user_value + 1) * 0x10` (user is 0..14) | `p1+0x378` ("rztrDamping" TrackBar) | `0x50` (80) | user = 4 | high on encoding, medium on label | `decomp_slider_overlay_0x352_00405518.c` line 194 |
| `speed_limit` | `0x11` (primary), mirrored to `0x12`, `0x13`, and `0x0F = primary - 0x14` | raw u8 | `p1+0x370` | `0xDC` (220) | ≈ max (unit unknown) | medium | `decomp_slider_overlay_0x352_00405518.c` lines 203-210 |

### Confidence notes and gaps

- **range** (high): the BE-u16 value from widget `p1+0x374` is written
  to bytes `0x0A..0x0B` and then replicated into three more u16 slots
  (`0x27..0x28`, `0x29..0x2A`, `0x2B..0x2C`). A value that multiple
  downstream subsystems each need a copy of is the canonical signature
  of "angular range / sweep limit". The live capture has raw `0x0050`
  (80). The Mini is documented to have 355° max sweep; we don't yet
  have a confirmed raw→degrees formula but the most plausible fit is
  `deg ≈ raw * (355/80) ≈ raw * 4.4375` (i.e. raw 80 = full Mini
  range ≈ 355°). This needs a `.svo` A/B diff to confirm before
  `axon set range 180` can do the unit conversion; until then we
  expose `range` in raw units only.

- **center** (high): widget `p1+0x380` is labeled "Neutral" via
  the `rztrNeutralChange` event-handler symbol at `007a9888`. The
  encoding is `param_2[6] = widget_value - 0x80`, so raw `0x80`
  corresponds to user value 0 (centered). Live: raw `0x80` → 0.
  This is the classic "trim / neutral" encoding and is as
  unambiguous as it gets.

- **direction** (medium): widget `p1+0x360` is a checkbox whose
  toggle handler (`FUN_00405518` lines 88-108) flips bit `0x02` of
  byte `0x25` with a secondary `0x01` "dirty" bit. The bit is
  stored persistently across reads/writes. There is no literal
  "Direction: Reverse" string in the decomp to confirm the label,
  but the checkbox-toggle→persistent-bit pattern is the canonical
  encoding for a binary rotation-direction flag, and no other bit
  in `0x25` has this asymmetric "set-and-hold" pattern. The other
  high-confidence flag bits in `0x25` (`0x10`, `0x08`, `0x04`,
  `0x80`, `0x60`) are all tied to model-mode / PPM-range / advanced
  -mode selectors, not to a binary servo setting. Confidence is
  "medium" because we haven't found the label string; a `.svo` A/B
  diff of the vendor UI's "reverse" checkbox would promote it to
  "high".

- **damping** (high on encoding, medium on label): widget
  `p1+0x378` writes a small integer as `(value + 1) * 16` into byte
  `0x0C`. The encoding pattern (nibble × 16) limits the user to 15
  discrete steps, which matches a "Damping Factor" slider with 15
  discrete detents. The ASCII label string at `007a734a`
  (`'Damping Factor: '`) and the VCL event-handler symbol
  `rztrDampingChange` at `007a98b4` confirm that a "Damping" track
  bar exists in the UI. Tying that track bar specifically to
  widget offset `0x378` is inferential: it's the only non-Neutral
  nibble-packed track bar that writes exactly one byte to the
  config block, so it's the best fit. The issue request listed this
  parameter as "deadband" — in strict PWM-servo terminology deadband
  is something else (the ± µs tolerance around neutral), but the
  vendor UI's equivalent in this slot is **damping**. The CLI should
  expose it under the name `damping` (canonical) with `deadband` as
  an alias for backward-compat with the issue text.

- **speed_limit** (medium): widget `p1+0x370` writes its raw byte to
  byte `0x11`, then copies the same byte to `0x12` and `0x13`, and
  writes `value - 0x14` (i.e. `-20`) to byte `0x0F`. The pattern of
  "one widget, several internal rate-limit registers, one of them
  with a bias offset" is characteristic of a max-speed / max-current
  setting. We can't tell from the decomp alone whether the unit is
  percent (0..100), raw PWM counts, or µs-per-loop — the live value
  `0xDC` (220) doesn't cleanly match any of those. Reported
  confidence is "medium"; the CLI should expose `speed_limit` in
  raw units for v1.0 and add a unit conversion once we have a
  `.svo` A/B diff.

## Source functions (Ghidra decomp, `research/static-analysis/ghidra_out/`)

| File | Purpose |
|---|---|
| `param_helper_READ_004047d0_FUN_004047d0.c` | Chunked read primitive (max 59 B/chunk, 25 ms between chunks, validates `rx[1] != 0 && rx[2] == 0`) |
| `param_helper_WRITE_00404900_FUN_00404900.c` | Chunked write primitive (same chunking, validates only `rx[1] != 0`) |
| `decomp_slider_overlay_0x352_00405518.c` | Primary UI→byte serializer. Writes ~25 bytes of the block. **Authoritative source for the v1.0 core five table above.** |
| `decomp_slider_overlay_0x357_00406248.c` | Secondary UI overlay. Touches `[0x12]`, `[0x25]` bits, `[0x36]` (called for a sub-panel / alt mode). |
| `decomp_param_caller_0040330c_arrival_0040330c.c` | Arrival-handler. Calls `FUN_00404b28` (load-to-UI) which we do not yet have decomp for. |
| `param_read_caller_00403060_FUN_00403060.c` | "Save" (write-to-device) handler. Reads current block, calls `FUN_00405518` to overlay UI values, writes block back. |
| `00402948_FUN_00402948.c` | Label formatter: reads dropdown `p1+0x354`, formats "PPM Range: 500-2500 us" etc, writes to label `p1+0x32c`. Confirms `p1+0x354` is the **PPM-range mode selector**, not a parameter. |
| `004dc230_atIlabelatTiLabelatSetCaptionqqrx17SystematWideString.c` | VCL `TiLabel::SetCaption` (the label-write primitive). Not useful without cross-refs since the labels are UTF-16 wide strings and don't appear in `data_printable_runs.txt`. |
| `data_printable_runs.txt` | ASCII-only strings scraped from the exe. Contains `'Damping Factor: '` (line 3), `'PPM Range: %s'` format (line 15-18), `'rztrNeutralChange'` (line 56), `'rztrDampingChange'` (line 57) — the four pieces of label-ground-truth we have. |

## Confirmed mapping (high confidence — full surface, including non-core bytes)

All offsets below come from line-by-line reads of
`FUN_00405518` and `FUN_00406248`. The five core-five parameters are
repeated here for completeness but the authoritative summary for the
CLI is the "Confirmed mapping (v1.0 core five)" table above.

| Offset    | Name / meaning                    | Encoding | Source |
|-----------|-----------------------------------|----------|--------|
| `0x00..0x03` | **Model magic / PPM-range selector** (4 bytes) | One of 5 hardcoded quadruples selected by UI dropdown `p1+0x354` (PPM range: 500-2500 us, 900-2100 us, 1100-1900 us, 450-1050 us, 130-470 us). `00402948_FUN_00402948.c` confirms the dropdown is the "PPM Range" selector — **this is not a parameter**, it's a mode. | `FUN_00405518` lines 42-87; label formatter `FUN_00402948` |
| `0x04`    | UI widget `p1+0x358` (byte)       | Raw byte — tied to the PPM-range dropdown. Most likely the per-mode pulse-width scale inside the chosen PPM range. Not one of the core-five. | `FUN_00405518` line 66, 75, 85 |
| `0x05`    | = `[0x04]` (same widget written twice) | Raw byte | `FUN_00405518` line 67, 76, 86 |
| `0x06`    | **center** — `p1+0x380` ("rztrNeutral") widget minus `0x80` | Signed offset from 0x80 | `FUN_00405518` line 193 |
| `0x0A..0x0B` | **range** — 16-bit BE from `p1+0x374` widget | BE u16 | `FUN_00405518` lines 217-218 |
| `0x0C`    | **damping** — `(p1+0x378 "rztrDamping" widget + 1) * 0x10` | 4-bit packed × 16 | `FUN_00405518` line 194 |
| `0x0F`    | **speed_limit** (offset slot) — `p1+0x370` widget minus `0x14` | Raw byte | `FUN_00405518` lines 206, 210 |
| `0x11`    | **speed_limit** (primary) — `p1+0x370` widget | Raw byte | `FUN_00405518` line 209 |
| `0x12`    | **speed_limit** (mirror) — `p1+0x370` widget (primary), OR `p1+0x3e4` widget (secondary overlay) | Raw byte — one panel wins depending on active mode | Both overlays |
| `0x13`    | **speed_limit** (mirror) — `p1+0x370` widget | Raw byte | `FUN_00405518` line 208 |
| `0x25`    | **Flags byte** — 6+ toggles packed: bit `0x10` = `p1+0x35c` (mode), bit `0x08` = `p1+0x364` (mode), bit `0x04` = `p1+0x368` (mode), bit `0x02` = **direction** (`p1+0x360`, persistent), bit `0x01` = direction "dirty" flag, bit `0x80` = `p1+0x36c` (advanced-mode), bits `0x60` = `p1+0x37c` 3-way selector | Bitfield | `FUN_00405518` various |
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

The v1.0 core five are now mapped (see the "Confirmed mapping (v1.0
core five)" table near the top of this file). Consumer order, for
the CLI `axon get`/`axon set` implementer:

1. **range** — HIGH confidence on byte offsets (`0x0A..0x0B` + mirrors). Raw-unit exposure in v1.0; degrees formula needs `.svo` A/B diff.
2. **center** — HIGH confidence. Widget is labeled "Neutral" in the vendor exe. Expose in raw-offset units; degrees formula needs a `.svo` A/B diff to pin the per-model scale.
3. **direction** — MEDIUM confidence on byte/bit (`byte 0x25, bit 0x02`); no direct label-string confirmation, but the checkbox-toggle→persistent-bit pattern is unambiguous. Expose as a boolean (`normal` / `reversed`).
4. **damping** (issue text called this "deadband") — HIGH confidence on encoding (`byte 0x0C`, nibble×16). Medium confidence on the human-readable label (the ASCII string `'Damping Factor: '` at `007a734a` confirms a "Damping" widget exists in the UI; tying it specifically to byte `0x0C` is inferential).
5. **speed_limit** — MEDIUM confidence. Byte `0x11` primary + mirrors at `0x12`, `0x13`, `0x0F`. Unit unknown, raw-value exposure in v1.0.

All five are implementable against the 95-byte block in raw units
immediately. Degree-unit conversion (for `range` and `center`) and
percent-unit conversion (for `speed_limit`) should be deferred until
we have A/B `.svo` diffs — that's the lowest-friction way to promote
each parameter from "raw-only" to "raw + physical-units".

## Open follow-ups (not blocking the v1.0 CLI)

- Walk `FUN_00404b28` (the load-to-UI function) to confirm the
  widget→label bindings from the inverse direction. This function
  lives at `004054a0` / `00404b28` but is not in `ghidra_out/` yet.
- Identify `p1+0x37c` (the 3-way bit-field writer at `byte 0x25`
  bits `0x60`). It's a 3-way enum but we don't know its label.
- Walk `FUN_0040330c` for the `Sleep(0x19)` + read-file call — may
  surface additional mode labels.
- Re-run the ASCII-string scan with a UTF-16 pass to surface the
  wide-string `TiLabel` captions for each widget — that's the
  single biggest unblock for labelling the remaining ~20 unmapped
  bytes with high confidence.
