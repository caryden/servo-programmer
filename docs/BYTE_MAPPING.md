# 95-byte config block — offset → parameter mapping

Single source of truth for which config-block byte means what. The
CLI's `axon get`/`axon set` implementations live on top of this
mapping. The mapping is authored by reading the vendor exe decomp
(primary) and cross-checked against vendor documentation and `.svo`
diffs (fallback).

**Protocol reminders:**
- The block is 95 bytes (`0x5F`), transported via two HID
  round-trips: `(addr=0x00, len=0x3B)` + `(addr=0x3B, len=0x24)`.
- On the wire it's identical — no encoding.
- `.svo` files are a raw dump of these 95 bytes, with no header.

## Servo Mode vs CR Mode — parameter visibility depends on mode

Axon V1.3 servos run in one of two firmware modes, determined by
which `.sfw` file is flashed. Different parameters are valid in
each mode — the CLI must respect this and reject
`axon set <param>` attempts for parameters that don't apply in
the current mode.

| Mode | Identify byte 5 (`rx[5]`) | UI panel decomp | SFW file pattern |
|---|---|---|---|
| **Servo Mode** (position control, the default) | `0x03` | `FUN_00405518` — primary overlay, ~25 byte writes covering the full parameter set | `Axon_*_Servo_Mode.sfw` |
| **CR Mode** (continuous rotation / speed control) | `0x04` | `FUN_00406248` — secondary overlay, only 3 byte writes (`0x12`, bits in `0x25`, and `0x36`) | `Axon_*_Modified_CR_Mode.sfw` |

The two-mode split explains two things we previously found
surprising:

1. Why `FUN_00406248` is so much smaller than `FUN_00405518` — it
   only has to write the 3-4 bytes that are actually editable in
   CR Mode. The other ~20 bytes are left untouched.
2. Why bytes `0x14..0x18` (the monotonically-decreasing 5-point
   curve) and `0x19..0x1E` (three BE-u16 duration fields) are
   *read* by `FUN_00405518` but not *written* — they are the
   Overload Protection state-machine values, and the docs
   explicitly say Overload Protection is "3-stage in Servo Mode,
   unavailable in CR Mode." Those bytes are set from a separate
   handler (probably `FUN_00404b28`, the load-side function we
   don't yet have decomp for) and are only valid when the servo is
   in Servo Mode.

**Mode detection at runtime:** the CLI's `identify` function
already reads `rx[5]`. Extend it to expose the mode byte so the
command layer can branch on it. The protocol layer's
`IdentifyReply` type should add a `mode: "servo_mode" | "cr_mode"
| "unknown"` field.

**Parameter availability by mode:**

| Parameter | Servo Mode | CR Mode | Why |
|---|---|---|---|
| Servo Angle | ✅ yes | ❌ no | CR rotates continuously — no fixed range |
| Servo Neutral | ✅ yes | ✅ yes | Both modes use a neutral PWM pulse width |
| Sensitivity (deadband) | ✅ yes | ❌ no | Dead-band is meaningful only for a "hold position" servo |
| Dampening Factor | ✅ yes | ❌ no | Position-loop PID D; CR is speed control |
| Inversion | ✅ yes | ✅ yes | Both modes have a direction |
| Loose PWM Protection | ✅ yes | ✅ yes | Both modes have failsafe behavior on signal loss |
| PWM Power | ✅ yes | ✅ yes | Both modes need a motor power cap |
| Soft Start | ✅ yes | ✅ yes | Both modes can limit acceleration |
| Overload Protection | ✅ yes (3-stage) | ❌ no | Archive docs: "3-stage in Servo Mode; unavailable in CR Mode" |

The catalog's per-parameter `modes` field encodes this table
directly. The `axon set` command should read the current mode via
`identify` at the start of the read-modify-write cycle and
refuse to set parameters whose `modes` array does not include
the current mode, returning exit code 5 with a clear message.

## Target bootloader version — V1.3, NOT MK2

**This project targets the Axon `USBBootloader V1.3` dongle**, which is
what our hardware reports in its USB descriptor (VID `0x0471` PID
`0x13AA`, `iProduct = "USBBootloader V1.3"`). The vendor exe we
reverse-engineered is `Axon_Servo_Programming_Software_v1.0.5.exe`,
which pairs with the V1.3 bootloader.

**The newer Axon MK2 programmer (paired with bootloader V1.4) adds
parameters that do NOT exist in V1.3**:

- Left and Right Limit (separate from Servo Angle)
- Refresh Rate
- Power-On Sound (boot beep)

These MK2-only parameters are **out of scope for v1.0**. We can't
map them because we don't have the MK2 exe decompiled and we don't
have a V1.4 dongle to test against. Any future support is tracked
in a follow-up issue (not in the v1.0 milestone).

**Canonical parameter reference**: we use the V1.3-era
[archive docs at docs.axon-robotics.com/archive/programmer](https://docs.axon-robotics.com/archive/programmer)
as the authoritative list of what a V1.3 servo exposes. That page
lists nine configurable parameters, reproduced below as the
canonical set for the v1.0 CLI.

## Canonical V1.3 parameter set (from vendor archive docs)

| # | Canonical name | Description (verbatim from vendor docs) | Unit | Notes |
|---|---|---|---|---|
| 1 | **Servo Angle** | "Operating travel of the servo, scaled from 0→255 to 0→355" | raw 0-255 → degrees (0-355° on Mini, varies by model) | Angular sweep of the servo |
| 2 | **Servo Neutral** | "Offsets the Neutral Position of the servo (in us)" | **microseconds** | Center trim, NOT degrees. "Significant adjustments ... can cause unintended side effects." |
| 3 | **Dampening Factor** | "Adjusts the D coefficient in the servo PID loop" | unitless PID coefficient | "It is not recommended to adjust Dampening Factor. It is tuned to work out of the box." |
| 4 | **Sensitivity** | "Dead-band of the servo. Ultra high = 1us" | microseconds | **The PWM dead-band** — the window around neutral where the servo doesn't move. Different from Dampening Factor! |
| 5 | **PWM Power** | "set a cap on the maximum power output power of the servo. Useful for use on current limited devices. 0% = no power, 100% = max power" | percent (0-100) | Recommended defaults: 66% (MAX/MAX+ @ 4.8v), 75% (MINI/MINI+ @ 4.8v), 85% (@ 6.0v) |
| 6 | **Soft Start** | "Limits acceleration on startup" | — | Prevents sudden motion at power-on |
| 7 | **Inversion** | "Reverses the direction of the servo (CCW default)" | boolean | CCW (normal) or CW (reversed) |
| 8 | **Loose PWM Protection** | Servo behavior when losing PWM signal | enum: `release` / `hold` / `neutral` | `release` = no power (as if unpowered); `hold` = holds last commanded position; `neutral` = moves to middle position |
| 9 | **Overload Protection** | "Reduces the power output of the servo when stalled (to avoid burning out the motor)" by setting max power to a percentage after stalling for specified seconds | percent + duration, **3-stage** in Servo Mode, unavailable in CR Mode | Progressive power reduction on sustained stall |

**Important clarification for anyone mapping servo code to physical
behavior:** in PWM-servo terminology, "deadband" and "damping" are
two different things:

- **Deadband** (vendor's **Sensitivity** parameter) is the microsecond
  window around the neutral PWM pulse where the servo does not move
  at all. Used to prevent jitter when the PWM signal has noise.
  Smaller deadband = more sensitive to small commands.
- **Damping** (vendor's **Dampening Factor** parameter) is the D term
  in the internal position-control PID loop. It governs how the
  servo resists overshoot and oscillation when moving *to* a target
  position. Higher damping = more aggressive brake near target.

They live in different bytes of the config block and should be
exposed under different names in the CLI.

## Confirmed byte mapping (v1.0 CLI targets)

This is the authoritative byte → parameter mapping that the v1.0
CLI's `axon get` and `axon set` commands implement against. Each
entry was extracted from the vendor exe decomp under
`research/static-analysis/ghidra_out/` by walking the UI→byte
serializer `FUN_00405518` and cross-referencing against:

1. The vendor archive docs' canonical parameter list (above)
2. ASCII label strings found in `data_printable_runs.txt`
3. VCL event-handler symbols in the same file
4. The live capture in `research/saleae-captures/dual_test7_623.csv`

The **load-side** function `FUN_00404b28` (called from
`decomp_param_caller_0040330c_arrival_0040330c.c:165`) would
give us a cleaner inverse mapping — `FUN_00404b28` reads bytes
from the config block and writes them into UI widgets, so walking
it yields the widget→byte relationship from the opposite direction.
That function is not yet in `ghidra_out/` at the time of writing
and its decompilation is tracked as an open follow-up
(see "Open follow-ups" at the bottom of this file).

| Canonical name | Offset(s) | Encoding | Widget | Live raw | Confidence | Source |
|---|---|---|---|---|---|---|
| **Servo Angle** | `0x0A..0x0B`, mirrored at `0x27..0x28`, `0x29..0x2A`, `0x2B..0x2C` | BE u16 (low byte dominant in observed data — 1-byte field with a zero high byte) | `p1+0x374` | `0x0050` (80) | **high** | `decomp_slider_overlay_0x352_00405518.c` lines 211-230 |
| **Servo Neutral** | `0x06` | `stored = user_us + 0x80` (signed offset from 0x80). Unit is **microseconds**, not degrees. | `p1+0x380` ("rztrNeutral" TrackBar, confirmed by `rztrNeutralChange` symbol at `007a9888`) | `0x80` → 0 µs offset | **high** | `decomp_slider_overlay_0x352_00405518.c` line 193 |
| **Sensitivity** (deadband, µs) | `0x0C` | `stored = (user_step + 1) × 0x10` where `user_step` ∈ 0..14. User step 0 → raw `0x10` → "ultra high" sensitivity (1 µs deadband). | `p1+0x378` | `0x50` → user step 4 | **high** on encoding, **medium** on label | `decomp_slider_overlay_0x352_00405518.c` line 194 + archive docs |
| **Inversion** (direction) | byte `0x25`, bit `0x02` (mask `0x02`) with a secondary bit `0x01` used as a dirty-flag toggle | bitfield: `0` = normal (CCW), `1` = reversed (CW) | `p1+0x360` (checkbox) | `0x25 = 0xE3` → bit 2 = 0 → normal | **medium** | `decomp_slider_overlay_0x352_00405518.c` lines 88-108 |
| **Loose PWM Protection** | byte `0x25`, bits `0x60` (mask `0x60`) — two bits encoding three values | 3-way enum: bits = `00` → ???, `01` (mask `0x40`) → ???, `1x` (mask `0x60`) → ???. Specific mapping of bit-value to Release/Hold/Neutral TBD from a `.svo` A/B diff. | `p1+0x37c` (3-way selector) | `0x25 & 0x60 = 0x60` → one specific mode | **high** on location, **low** on which bit value = which mode | `decomp_slider_overlay_0x352_00405518.c` lines 179-192 |
| **PWM Power** | byte `0x11` (+ mirrors at `0x12`, `0x13`, and a `-0x14` offset at `0x0F`) | raw u8, **probable** mapping to percent: `percent ≈ raw × (100/255)`. Live raw `0xDC` (220) → ≈86%, which matches the vendor's recommended "85% @ 6.0v" default for Mini. | `p1+0x370` | `0xDC` (220) → ≈86% | **medium** | `decomp_slider_overlay_0x352_00405518.c` lines 203-210 + archive docs' recommended-default cross-check |
| **Model Name** | `0x40..0x47` | 8-byte ASCII with `*` padding | Read-only, set by the servo firmware | `"SA33****"` (Mini) | **high** | Direct capture observation |

### Confidence details

- **Servo Angle** (high): The BE-u16 value from widget `p1+0x374`
  is written to bytes `0x0A..0x0B` and replicated into three more
  u16 slots (`0x27..0x28`, `0x29..0x2A`, `0x2B..0x2C`). Multiple
  downstream subsystems each get a copy — that's the canonical
  signature of a "total travel / sweep limit" value. The Mini is
  documented to have a **360° max range** (per the MK2 product
  page) or **355°** (per the archive programmer docs; the 5°
  difference is probably spec drift between bootloader versions).
  Live raw `0x0050` (80). Vendor docs say the raw value scales
  `0→255 to 0→355°`, so raw 80 → ≈111°. The formula
  `deg = raw × (355/255)` is cited by the docs and should be used
  for Mini. The CLI should expose Servo Angle in both raw and
  degrees, using the per-model `max_range_deg` from the catalog
  for the conversion.

- **Servo Neutral** (high): Widget `p1+0x380` is definitively
  labeled "Neutral" via the `rztrNeutralChange` VCL event-handler
  symbol at `007a9888`. The encoding is `param_2[6] = widget_value
  - 0x80`, so raw `0x80` corresponds to 0 µs offset (centered).
  **Unit is microseconds, not degrees.** The previous mapping in
  this doc incorrectly listed degrees — corrected here. The CLI
  should expose this in µs.

- **Sensitivity** (high on encoding, medium on label): Widget
  `p1+0x378` writes a small integer as `(value + 1) × 0x10` into
  byte `0x0C`. The encoding pattern (0x10 × nibble) gives the user
  15 discrete steps, which matches how a "Sensitivity" selector
  would work with "ultra high" (1 µs) at one end and a looser
  deadband at the other. The archive docs explicitly name the
  parameter that lives here as **Sensitivity** (not Damping), so
  the label here is correct. **Previous versions of this doc
  incorrectly labeled byte `0x0C` as "damping" because the agent
  for #7 matched the wrong literal string in the decomp. The
  corrected label is Sensitivity.** A `.svo` A/B diff where the
  user changes the "Sensitivity" slider in the vendor UI would
  confirm this.

- **Inversion** (medium): Widget `p1+0x360` is a checkbox whose
  toggle handler (`FUN_00405518` lines 88-108) flips bit `0x02` of
  byte `0x25`, with a secondary `0x01` bit used as a dirty-flag
  toggle. No direct "Inversion" label string in the decomp, but
  the archive docs say this parameter exists and the bit
  pattern is the canonical signature of a rotation-direction flag.
  Confidence is "medium" pending a `.svo` A/B diff of the vendor
  UI's Inversion checkbox.

- **Loose PWM Protection** (high on location, low on value
  mapping): Widget `p1+0x37c` is a 3-way selector whose handler
  sets bits `0x60` of byte `0x25` to one of three value
  combinations (0, `0x40`, `0x60`). The archive docs specify that
  Loose PWM Protection has exactly three modes
  (**Release** / **Hold** / **Neutral**), which is a textbook
  match for a 2-bit / 3-value enum. The BYTE is correct with
  high confidence. **Which numeric value of the bit-field
  corresponds to which mode** is unknown from the decomp alone
  and requires a `.svo` A/B diff: save three `.svo` files from
  the vendor UI, one with each Loose PWM Protection mode selected,
  and check which value of `(config[0x25] & 0x60)` corresponds to
  which mode. Until that diff is available, the CLI should NOT
  expose `set` for this parameter; `get` should return the raw
  bit value annotated with "mode mapping unknown".

- **PWM Power** (medium): Widget `p1+0x370` writes its raw byte to
  byte `0x11`, then copies the same byte to `0x12` and `0x13`,
  and writes `value - 0x14` (i.e. `−20`) to byte `0x0F`. The live
  raw value `0xDC` (220) corresponds to `220 / 255 ≈ 86%`, which
  matches the vendor's recommended default PWM Power of **85%**
  for the Mini at 6.0v operation. That's a strong cross-check.
  The 4-byte mirror pattern is consistent with the docs'
  description of a 3-stage Overload Protection system — bytes
  `0x11`, `0x12`, `0x13` might be the three progressively-reduced
  power caps applied during sustained stall, and `0x0F =
  main - 20` might be the absolute floor. Precise bit-to-stage
  mapping requires the load-side decomp. For v1.0 the CLI should
  expose PWM Power in percent, reading from byte `0x11` as the
  primary.

### Not yet mapped (required for v1.0 but blocked on more decomp)

The following canonical V1.3 parameters are in the archive docs
but we don't yet have a confident byte mapping for them:

| Canonical name | Why not mapped yet |
|---|---|
| **Dampening Factor** (PID D coefficient) | The `'Damping Factor: '` label string at `007a734a` confirms this parameter exists in the UI, and the `rztrDampingChange` symbol at `007a98b4` points to a "Damping" TrackBar widget. But we haven't found the widget offset or the byte position in the current decomp. Likely lives in the `0x35..0x3A` "advanced mode" range or in `FUN_00406248`. Needs the load-side `FUN_00404b28` decomp to confirm. |
| **Soft Start** | Not referenced in any currently-decompiled function. Probably one of the unmapped widgets (`p1+0x3dc`, `p1+0x3e0`, `p1+0x3e4` in `FUN_00406248`). Needs more decomp. |
| **Overload Protection** (3-stage % + times) | Partially implicated in the PWM Power mirror pattern, but we can't distinguish "main PWM Power" from "stage-N overload reduction" without the load-side decomp. Bytes `0x14..0x18` (`29 21 1D 19 14` — five monotonically-decreasing values) and `0x19..0x1E` (three BE-u16 values of `0x003C = 60`) are strong candidates for "per-stage power curve" and "per-stage duration" respectively, but unconfirmed. |

Until the above are mapped, the CLI's `axon get <name>` / `axon set
<name>` will return `"not yet mapped"` errors for these parameters
and point the user at this file. Users can still round-trip the
entire 95-byte block via `axon read --svo` / `axon write --from
cfg.svo`, which preserves all bytes regardless of mapping.

## Full byte layout reference

All offsets below come from line-by-line reads of `FUN_00405518`
and `FUN_00406248`. The canonical-name table above is the
authoritative reference for the CLI; this section documents the
full set of byte writes observed in the decomp for completeness.

| Offset | Name / meaning | Encoding | Source |
|---|---|---|---|
| `0x00..0x03` | **Model magic / PPM-range selector** (4 bytes) | One of 5 hardcoded quadruples selected by dropdown `p1+0x354` (PPM range: 500-2500 µs, 900-2100 µs, 1100-1900 µs, 450-1050 µs, 130-470 µs). `00402948_FUN_00402948.c` confirms the dropdown is the "PPM Range" selector — **this is not a parameter**, it's a mode. | `FUN_00405518` lines 42-87; label formatter `FUN_00402948` |
| `0x04` | UI widget `p1+0x358` (byte) | Raw byte — tied to the PPM-range dropdown. Most likely the per-mode pulse-width scale inside the chosen PPM range. | `FUN_00405518` line 66, 75, 85 |
| `0x05` | = `[0x04]` (same widget written twice) | Raw byte | `FUN_00405518` line 67, 76, 86 |
| `0x06` | **Servo Neutral** — `p1+0x380` ("rztrNeutral") widget minus `0x80` | Signed µs offset from neutral | `FUN_00405518` line 193 |
| `0x0A..0x0B` | **Servo Angle** — 16-bit BE from `p1+0x374` widget | BE u16 | `FUN_00405518` lines 217-218 |
| `0x0C` | **Sensitivity** (deadband) — `(p1+0x378 widget + 1) × 0x10` | 4-bit packed × 16, encoded in µs | `FUN_00405518` line 194 |
| `0x0F` | **PWM Power** (offset slot) — `p1+0x370` widget minus `0x14` | Raw byte | `FUN_00405518` lines 206, 210 |
| `0x11` | **PWM Power** (primary) — `p1+0x370` widget | Raw byte | `FUN_00405518` line 209 |
| `0x12` | **PWM Power** (mirror) — `p1+0x370` widget (primary), OR `p1+0x3e4` widget (secondary overlay) | Raw byte — one panel wins depending on active mode | Both overlays |
| `0x13` | **PWM Power** (mirror) — `p1+0x370` widget | Raw byte | `FUN_00405518` line 208 |
| `0x14..0x18` | 5 bytes: `29 21 1D 19 14` on Mini (41, 33, 29, 25, 20 — monotonically decreasing). **Strong candidate for the Overload Protection 5-point power curve.** | Raw u8s | Read but not written by `FUN_00405518`; set elsewhere |
| `0x19..0x1E` | 3 × BE u16 = three copies of `0x003C = 60` on Mini. **Strong candidate for Overload Protection stage durations (in seconds?).** | BE u16 × 3 | Read but not written by `FUN_00405518`; set elsewhere |
| `0x25` | **Flags byte** — 6+ toggles packed: bit `0x10` = `p1+0x35c` (mode), bit `0x08` = `p1+0x364` (mode), bit `0x04` = `p1+0x368` (mode), bit `0x02` = **Inversion** (`p1+0x360`, persistent), bit `0x01` = Inversion "dirty" flag, bit `0x80` = `p1+0x36c` (advanced-mode toggle, gates `0x35..0x3A` PID writes), bits `0x60` = **Loose PWM Protection** (`p1+0x37c` 3-way selector) | Bitfield | `FUN_00405518` various |
| `0x27..0x28` | BE u16 mirror of **Servo Angle** (`[0x0A..0x0B]`) | Same widget written four times total | `FUN_00405518` lines 221-222 |
| `0x29..0x2A` | BE u16 mirror of **Servo Angle** | " | `FUN_00405518` lines 225-226 |
| `0x2B..0x2C` | BE u16 mirror of **Servo Angle** | " | `FUN_00405518` lines 229-230 |
| `0x35..0x3A` | 6 bytes from float sliders (`p1+0x388`, `p1+0x390`, `p1+0x398`, `p1+0x384`, `p1+0x38c`, `p1+0x394`) — only written when `[0x25] & 0x80` (advanced-mode toggle). **One of these slots is probably Dampening Factor.** | Quantized float → byte | `FUN_00405518` lines 115-177 |
| `0x36` | Also written by secondary overlay from `p1+0x3dc` | Raw byte | `FUN_00406248` line 29 |
| `0x40..0x47` | **Model Name** (ASCII with `*` padding) | ASCII | Read-only, set by servo firmware |
| `0x5E` | End sentinel / layout version | `0x01` observed on Mini | TBD |

## Source functions (Ghidra decomp, `research/static-analysis/ghidra_out/`)

| File | Purpose |
|---|---|
| `param_helper_READ_004047d0_FUN_004047d0.c` | Chunked read primitive (max 59 B/chunk, 25 ms between chunks, validates `rx[1] != 0 && rx[2] == 0`) |
| `param_helper_WRITE_00404900_FUN_00404900.c` | Chunked write primitive (same chunking, validates only `rx[1] != 0`) |
| `decomp_slider_overlay_0x352_00405518.c` | **Primary UI→byte serializer.** Writes ~25 bytes of the block. Authoritative source for the canonical-name table above. |
| `decomp_slider_overlay_0x357_00406248.c` | Secondary UI overlay. Touches `[0x12]`, `[0x25]` bits, `[0x36]` (called for a sub-panel / alt mode). |
| `decomp_param_caller_0040330c_arrival_0040330c.c` | Arrival-handler. Calls `FUN_00404b28` (load-to-UI) which we do not yet have decomp for. |
| `param_read_caller_00403060_FUN_00403060.c` | "Save" (write-to-device) handler. Reads current block, calls `FUN_00405518` to overlay UI values, writes block back. |
| `00402948_FUN_00402948.c` | Label formatter: reads dropdown `p1+0x354`, formats "PPM Range: 500-2500 us" etc, writes to label `p1+0x32c`. Confirms `p1+0x354` is the **PPM-range mode selector**, not a parameter. |
| `004dc230_atIlabelatTiLabelatSetCaptionqqrx17SystematWideString.c` | VCL `TiLabel::SetCaption`. Not useful without cross-refs since the labels are UTF-16 wide strings and don't appear in `data_printable_runs.txt`. |
| `data_printable_runs.txt` | ASCII-only strings scraped from the exe. Contains `'Damping Factor: '` (line 3), `'PPM Range: %s'` format, `'rztrNeutralChange'` (line 56), `'rztrDampingChange'` (line 57) — the four pieces of label-ground-truth we have. UTF-16 wide strings (used by Delphi VCL Captions) are not in this file. |

## Open follow-ups (not blocking the v1.0 CLI)

1. **Decompile `FUN_00404b28`** (the load-to-UI function for
   `0x352` / Mini-class servos). It's called from
   `decomp_param_caller_0040330c_arrival_0040330c.c:165` but is
   not in `ghidra_out/` yet. Walking it would resolve every
   "unknown label" in the table above because it reads each byte
   from the config block and writes it into a named widget.
2. **Decompile `FUN_004054a0`** (the load-to-UI function for the
   `0x357` / other-class servos). Same reason.
3. **UTF-16 string scan of the exe.** The Delphi VCL `TLabel`
   captions ("Servo Angle", "Sensitivity", "PWM Power", "Loose
   PWM Protection", etc.) live in the exe as wide strings and
   don't appear in the ASCII-only `data_printable_runs.txt`. A
   fresh `strings -e l` pass would surface them and unlock the
   widget→label cross-references.
4. **`.svo` A/B diffs** to confirm each mapping: save two `.svo`
   files per parameter from the vendor UI, one before the change
   and one after, and diff. The diff bytes confirm the mapping.
   This is the cheapest "ground truth" test available.
5. **Three-way Loose PWM Protection diff**: save three `.svo`
   files, one with each Loose PWM Protection mode selected, and
   read off which `(config[0x25] & 0x60)` value corresponds to
   which mode. Unblocks `axon set loose-pwm-protection` for
   v1.0.

## Recommended priority for `axon get`/`axon set`

For v1.0, the CLI should implement these with the confidence levels
indicated:

| Priority | Parameter | Confidence | Unit for CLI exposure |
|---|---|---|---|
| P0 | Servo Angle | high | raw + degrees (needs `max_range_deg` from catalog) |
| P0 | Servo Neutral | high | microseconds |
| P0 | Sensitivity (deadband) | high | raw step + microseconds (needs verification of the "ultra high = 1 µs" scale) |
| P1 | Inversion | medium | boolean (`normal` / `reversed`) |
| P1 | PWM Power | medium | percent (with raw available) |
| P2 | Loose PWM Protection | mixed | enum — but **read-only** until `.svo` A/B diff confirms mode mapping |
| — | Dampening Factor | not mapped | blocked |
| — | Soft Start | not mapped | blocked |
| — | Overload Protection | not mapped | blocked |

The P0 parameters can round-trip immediately and are the minimum
the CLI needs to replace the vendor exe for common workflows. P1
can land in the same v1.0 release. P2 lands as read-only with a
documented limitation. The "not mapped" set errors out clearly and
points users at the whole-block `axon read --svo` / `axon write
--from cfg.svo` workflow.
