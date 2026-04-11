# Axon servo programmer wire protocol

This document specifies the USB and on-wire protocols used by the
Axon Robotics servo programmer dongle (VID `0x0471`, PID `0x13AA`).
It is reverse-engineered from the vendor exe and confirmed via wire
captures with a Saleae Logic 8 — see
[`research/saleae-captures/`](../research/saleae-captures/) for the
captures and
[`research/static-analysis/ghidra_out/`](../research/static-analysis/ghidra_out/)
for the source decomp.

Every protocol fact below is either visible in the vendor exe's
decompiled code or in one of the wire captures. If you want to see
the research session that led here, read
[`research/session-notes/findings-raw.md`](../research/session-notes/findings-raw.md).

## Overview

The dongle is a USB HID class device that bridges to a half-duplex
serial bus on the servo signal wire. Runtime config commands use a
9600-baud Dynamixel-v1-style framing. Firmware upload / recovery uses
the servo bootloader path at 115200 baud with raw bootloader payloads.
This document covers both halves: the host-to-dongle HID protocol and
the dongle-to-servo wire protocol. Because the dongle is a transparent
proxy for the three runtime commands (identify, read, write), those two
halves are effectively the same protocol wearing two different framings.

Target reader: a developer who wants to write their own tool
against the dongle, possibly in another language.

## USB descriptor

- Vendor ID: `0x0471`
- Product ID: `0x13AA`
- `iManufacturer`: `"Stone Laboratories inc."`
- `iProduct`: `"USBBootloader V1.3"`
- Class: HID
- Endpoints: `0x01` OUT, `0x81` IN
- Report size: 64 bytes
- Report ID: `0x04`
- Speed: 12 Mb/s (USB 1.1 full-speed)

VID `0x0471` is assigned to Philips / NXP, and the `"USBBootloader
V1.3"` product string is characteristic of the NXP LPC-series
reference USB bootloader example. The dongle presents with this
identity in normal operation, not just in firmware-update mode.

The Web HID filter to match the dongle is:

```js
navigator.hid.requestDevice({
  filters: [{ vendorId: 0x0471, productId: 0x13aa }],
});
```

## HID command set

| Command byte | Name | Direction | Purpose |
|---|---|---|---|
| `0x8A` | identify | host to dongle | Probe whether a servo is connected; returns model byte, mode byte, and 8-byte model-ID string |
| `0xCD` | read | host to dongle | Read N bytes from the servo's 95-byte config block |
| `0xCB` | write | host to dongle | Write N bytes to the servo's 95-byte config block |
| `0x90` / `0x91` | self-test | host to dongle | Observed in wire captures as an init-time probe (write 32 bytes at virtual address `0x0100`, read 32 bytes at `0x0000`). Not used by v1.0 of the `axon` CLI. |

The vendor exe additionally uses `0x5A`, `0x80`, `0x81`, `0x82`, and
`0x83` for firmware upload and a single-byte status probe. The
bootloader upload path is summarized in
[`Firmware upload / recovery`](#firmware-upload--recovery).

## Runtime HID request format (host to dongle)

All requests are exactly 64 bytes long (zero-padded on the right)
and begin with Report ID `0x04`.

```
byte  field
----  -----
 0    report id (always 0x04)
 1    command byte (0x8A / 0xCD / 0xCB)
 2    address high byte
 3    address low byte
 4    length (N) — for reads, the number of bytes requested; for writes, the number of data bytes that follow
 5..  data (only used for writes)
...   zero padding to 64 bytes total
```

The HID-side address is a 16-bit `(addr_hi, addr_lo)` pair, but
the dongle drops `addr_hi` before forwarding to the wire — the
on-wire address field is single-byte because the servo's config
block is only `0x5F` bytes long.

## Runtime HID reply format (dongle to host)

Replies are also exactly 64 bytes, same Report ID.

```
byte    field
----    -----
 0      report id (echoed: 0x04)
 1      status hi (0x01 = OK; any other value = command was NACKed and rx[1] echoes the command byte)
 2      status lo (0x00 = OK; 0xFA = "no servo"; 0x02 = command not executed)
 3      address echo (low byte of the address we sent)
 4      length echo (the length we sent)
 5..5+N data bytes from the servo's wire reply
5+N..63 zero padding
```

**Critical:** the success gate is `rx[1] === 0x01 && rx[2] === 0x00`.
If either byte differs, the data in `rx[5..]` is stale or invalid and
must not be trusted. The most common failure mode is `rx[2] === 0xFA`,
which means the dongle does not currently see a servo on the wire —
see the [State machine](#state-machine-and-the-primed-requirement)
section below.

Note that the write primitive only checks `rx[1] !== 0` — `rx[2]` is
not validated on writes. This is documented in the vendor exe's
`FUN_00404900` helper.

## Runtime wire format (dongle to servo, servo to dongle)

The dongle is a **transparent proxy** on the read and write paths
when properly primed: the HID command byte (`0x8A` / `0xCD` / `0xCB`)
is the same byte that appears on the 1-wire link as the Dynamixel
`INSTR` field. The on-wire frame is:

```
FF FF | ID | LEN | INSTR/ERR | PARAMS... | CHKSUM
```

Field reference:

- `0xFF 0xFF` — frame preamble
- `ID` — servo bus id; observed `0x01`
- `LEN` — number of bytes from `INSTR/ERR` through `CHKSUM` inclusive
  (i.e., `1 + N + 1` where N is the parameter count)
- `INSTR/ERR` — host frames carry `INSTR` (the command byte); servo
  replies carry an `ERR` byte at this position (`0x00` = OK)
- `PARAMS` — N parameter bytes
- `CHKSUM` — `(~(ID + LEN + INSTR + PARAMS)) & 0xFF` — bitwise NOT
  of the running sum, **not** two's complement

The runtime bus runs at 9600 baud, 8N1, half-duplex on a single wire.
One byte takes ~1.04 ms on the wire; a full 65-byte read reply (the
biggest runtime frame the dongle emits) takes ~68 ms.

### Checksum reference implementation

```js
function dynamixelChecksum(bytes) {
  let sum = 0;
  for (const b of bytes) sum = (sum + b) & 0xff;
  return (~sum) & 0xff;
}
```

`bytes` is the span from `ID` through the last `PARAM` inclusive.

## Identify (`0x8A`) flow

The vendor exe polls identify at a 300 ms cadence as a keepalive:

```
host:  FF FF 01 04 8A 00 04 6C
servo: FF FF 01 06 00 03 21 01 08 CB
```

A successful HID reply from a present servo has:

- `rx[1] = 0x01`
- `rx[2] = 0x00`
- `rx[5] = 0x03` (model byte; `0x04` also observed)
- `rx[7] = 0x01` (mode byte)

The `axon` CLI uses these four bytes as the "PRESENT" fingerprint.

The vendor exe builds an internal model code from `(rx[5], rx[7])`:

| `rx[5]` | `rx[7]` | internal code | Interpretation |
|---|---|---|---|
| 3 | 1 | `0x352` | MAX+ Modified CR |
| 4 | 1 | `0x357` | MAX+ Servo mode |
| other | — | 0 | "unknown" |

An 8-byte model-ID string is also present in the reply at
`rx[8..15]` (space-padded with `'*'` characters in the raw bytes;
the vendor exe rewrites `'*'` to `' '` before displaying it). For
the Axon Mini this string is `"SA33****"`, and for the Axon MAX
it is `"SA81BHMW"`.

## Read (`0xCD`) flow

The full 95-byte config block is fetched in **two chunks**, because
the vendor exe's read primitive caps each HID chunk at 59 bytes:

```
host:  FF FF 01 04 CD 00 3B F2          ; read addr=0x00, len=0x3B (59)
servo: FF FF 01 3D 00 <59 data bytes> <chk>

host:  FF FF 01 04 CD 3B 24 CE          ; read addr=0x3B, len=0x24 (36)
servo: FF FF 01 26 00 <36 data bytes> <chk>
```

59 + 36 = 95 bytes — matching the `.svo` file size and the buffer
the vendor exe allocates.

The chunked read primitive is `FUN_004047d0` in the vendor exe;
notable constants baked in:

- max chunk size = 59 bytes (`0x3B`)
- minimum inter-chunk sleep = 25 ms (`Sleep(0x19)`)
- success gate = `rx[1] != 0 && rx[2] == 0`

The two back-to-back Read cycles we captured on the wire were
byte-for-byte identical, so read is deterministic.

### Reference Python read primitive

```python
def read_config_chunk(dev, addr: int, length: int) -> bytes:
    tx = bytearray(64)
    tx[0] = 0x04                  # report id
    tx[1] = 0xCD                  # read
    tx[2] = (addr >> 8) & 0xff
    tx[3] = addr & 0xff
    tx[4] = length
    dev.write(EP_OUT, bytes(tx), timeout=500)
    time.sleep(0.08)              # ~68ms wire reply at 9600 baud + overhead
    rx = bytes(dev.read(EP_IN, 64, timeout=500))
    if rx[1] != 0x01 or rx[2] != 0x00:
        raise IOError(
            f"read nack: rx[1]={rx[1]:#04x} rx[2]={rx[2]:#04x} "
            "(dongle probably not primed — replug the servo)")
    return rx[5:5 + length]

def read_full_config(dev) -> bytes:
    return read_config_chunk(dev, 0x00, 0x3B) + \
           read_config_chunk(dev, 0x3B, 0x24)  # 95 bytes total
```

## Write (`0xCB`) flow

Writes use the same chunking as reads:

```
host: FF FF 01 3E CB 00 <59 data bytes> <chk>     ; write chunk 0
host: FF FF 01 27 CB 3B <36 data bytes> <chk>     ; write chunk 1
```

Where `LEN = 1 (INSTR) + 1 (addr) + N (data) + 1 (chksum)`. For the
two observed chunks:

| chunk | LEN  | addr | data bytes |
|-------|------|------|-----|
| 0     | 0x3E | 0x00 | 59  |
| 1     | 0x27 | 0x3B | 36  |

**Writes are fire-and-forget on the wire.** The servo does not ack
write frames — the 40 ms gap we captured between the chunk-0 write's
last byte and the chunk-1 write's first byte contains no traffic
at all, comfortably large enough to have held a single-byte ack
at 9600 baud. The HID-side write primitive (`FUN_00404900`) only
checks `rx[1] != 0`; `rx[2]` is not validated on writes.

The vendor exe issues a **read-then-write cycle** when the user
clicks "Write" (read both chunks, then write both chunks back).
This appears to be an exe-level convention — the vendor code runs
a strict read-modify-write of the whole 95-byte block so that bytes
the UI doesn't touch are round-tripped untouched. Whether the
dongle state machine also requires a preceding read is not yet
confirmed but suspected; see the note in
[`research/session-notes/findings-raw.md`](../research/session-notes/findings-raw.md#write-0xcb--decoded-from-researchsaleae-captures0xcb-datacsv).

## State machine and the "primed" requirement

The dongle has an internal state machine that controls whether HID
commands are forwarded to the wire:

- **Primed** (default after `adapter plug → servo plug` sequence):
  identify reports the servo present, and read / write commands are
  forwarded to the wire.
- **Cold**: identify reports the servo absent (`rx[2] = 0xFA`), and
  read / write commands are silently dropped (the dongle returns a
  NACK over HID and emits **zero bytes** on the wire).

**The cold state is entered by:**

- Disconnecting the servo from the dongle (physical unplug)
- Issuing a USB bus reset on the dongle (e.g., libusb's `dev.reset()`)
- Power-cycling the dongle

**The cold state is exited by:**

- Physically unplugging and re-plugging the servo (with the adapter
  still connected)

There is no software command to re-enter the primed state. The
plug-in order is therefore load-bearing: **plug in the adapter
first, then plug in the servo.**

> **Warning:** Never call `dev.reset()` on this dongle from libusb.
> It wipes the primed state and there is no way to recover except
> by physically replugging the servo. The hidapi-based transport
> (`node-hid` in the `axon` CLI) does not expose this primitive,
> which is one of the reasons we use it.

## Config block layout

The 95-byte block at servo addresses `0x00..0x5E` is the servo's
full user-facing parameter set. The config block is memory-mapped
onto a flash config page (`0x1C00..0x1C5E` in the firmware image),
and the `0xCB` write triggers an IAP sequence on the servo side
(copy page to RAM, apply incoming bytes, erase page, reprogram).
That erase-and-reprogram dance is entirely hidden behind the
single HID command — the host never sees it.

Notable fixed landmarks inside the 95-byte block:

- `0x00..0x06` — stable header / magic (identical across sessions).
  Observed values `3B D0 0B F6 82 82 80` on the Axon Mini.
- `0x40..0x47` — ASCII model-ID string (`"SA33****"` for Mini,
  `"SA81BHMW"` for Max). The vendor exe reads these bytes directly.
- `0x5E` — end-of-config sentinel / layout version byte. Observed
  value `0x01`.

See [`docs/BYTE_MAPPING.md`](BYTE_MAPPING.md) for the full
offset-to-parameter mapping.

## `.svo` file format

A `.svo` file is a **raw 95-byte dump of the on-wire config block**,
with no header, no checksum, no encoding. It is byte-for-byte
identical to what the servo emits in response to the two read
chunks above.

Saving to / loading from `.svo` is just `memcpy`. The vendor
file-open dialog pattern for `.svo` is (inferred from the UI, to
be confirmed by capture):

1. Read the `.svo` file directly into the 95-byte shadow
2. Issue a single `0xCB` write of the whole block

There is no validation step — it is up to the user to ensure the
`.svo` was saved from a compatible servo model.

## `.sfw` firmware file format

`.sfw` files are encrypted firmware images. The encryption is
**AES-128** with the fixed key `"TTTTTTTTTTTTTTTT"` (16 bytes of
ASCII `0x54`):

- The first 16 bytes are **ECB-decrypted** to a
  `[uint32_le length][12 × 'x']` header. The twelve `'x'` bytes
  are a magic fingerprint; if they don't match, the vendor exe
  raises *"Error 1030: Firmware is incorrect."*
- The remaining bytes are **CBC-decrypted** with `IV = 0`
- The decrypted plaintext is a short preamble (`@0801<model-id>\r\n`
  handshake + 13 sector-erase lines) followed by **standard Intel HEX**
  firmware records, terminated by `:00000001FF`

The key is not stored as a string in the binary — it is built at
runtime by `FillChar(&key_buf, 0x54, 16)` in the firmware-upload
handler (`FUN_004065b0` at VA `0x00406b27`). The encryption engine
is Brian Gladman's C reference AES implementation, linked in via
the Embarcadero VCL wrapper class `TXAes`.

For the four shipped firmware files:

| File | Size | Plaintext records |
|---|---:|---:|
| `Axon_Max_Modified_CR_Mode.sfw` | 15,152 | 13 erase + Intel HEX |
| `Axon_Max_Servo_Mode.sfw` | 17,104 | 13 erase + 397 data + 1 EOF |
| `Axon_Mini_Modified_CR_Mode.sfw` | 15,152 | 13 erase + Intel HEX |
| `Axon_Mini_Servo_Mode.sfw` | 17,216 | 13 erase + Intel HEX |

The decrypter is documented in
[`research/static-analysis/ghidra_out/004c4e94_atTXAesatAESDecFileqqrpct1puc.c`](../research/static-analysis/ghidra_out/)
and reproduced in the research script
[`research/static-analysis/static_analyze.py`](../research/static-analysis/static_analyze.py):

```bash
python3 research/static-analysis/static_analyze.py decrypt \
    downloads/Axon_Max_Servo_Mode.sfw \
    research/decrypted-firmware/Axon_Max_Servo_Mode.plain.bin
```

The "Servo Mode" and "Modified CR Mode" firmware variants for a
given servo family differ by exactly **one byte** — the byte at
flash offset `0x1C5F`: `0x00` for Modified CR, `0x01` for Servo Mode.

## Firmware upload / recovery

Firmware flashing uses a different wire protocol from the 9600-baud
runtime config path. A real `axon mode set servo --recover micro --yes`
capture against an Axon Micro is preserved in
[`research/saleae-captures/axon-recover-micro-2026-04-11-summary.md`](../research/saleae-captures/axon-recover-micro-2026-04-11-summary.md).

Observed servo-signal settings for the flash bootloader path:

- Baud: **115200**
- Format: 8N1
- Signal inversion: non-inverted
- Framing: raw bootloader bytes, not the `FF FF ... CHKSUM`
  Dynamixel-style runtime frame

The first bootloader exchange on the wire is:

```text
host:  01 02 03 04
servo: 56 30 2E 33 08 01
```

The reply decodes as boot version `V0.3` plus type bytes `08 01`.
Those type bytes match the `@0801...` header in the `.sfw`; this is the
wire-level family guard used before erase/write.

The observed successful Micro Servo Mode recovery flash sequence was:

1. `0x80` HID boot query forwards raw `01 02 03 04` at 115200; servo
   replies `56 30 2E 33 08 01`.
2. `0x81` key exchange sends 22 bytes and receives 22 bytes.
3. `0x82` sector erases send 13 encrypted 22-byte payloads, each
   ACKed by `55`.
4. `0x82` firmware writes send 398 encrypted 22-byte Intel HEX payloads,
   including EOF.
5. The servo reboots and returns to the normal 9600 identify protocol;
   the captured post-flash identify reply had mode byte `0x03` (Servo
   Mode).

This is the path used by `axon mode set --recover`: skip normal
identify/config reads, rely on the `.sfw` header and bootloader type-byte
check, then flash through the bootloader.

## See also

- [`docs/BYTE_MAPPING.md`](BYTE_MAPPING.md) — which byte of the
  95-byte config block means what
- [`docs/CLI_DESIGN.md`](CLI_DESIGN.md) — the v1 `axon` CLI command
  surface
- [`research/saleae-captures/README.md`](../research/saleae-captures/README.md)
  — the wire captures this protocol spec is built on
- [`research/session-notes/findings-raw.md`](../research/session-notes/findings-raw.md)
  — the unpolished research diary, kept as the source for the
  future blog post
- [`research/static-analysis/ghidra_out/`](../research/static-analysis/ghidra_out/)
  — decompiled vendor exe functions that back every claim here
