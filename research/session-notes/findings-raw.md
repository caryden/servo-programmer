# Axon Servo Programmer — Static RE Findings

Static reverse engineering of the Axon Programming Software v1.0.5 and the four
firmware files published on `docs.axon-robotics.com/archive/programmer`.

All analysis was done on macOS against the downloaded binaries in `downloads/`.
No code from the vendor has been executed; all findings are from static binary
analysis (capstone + pefile for quick probes, Ghidra 12.0.4 headless + Jython
for decompilation and xref walks) plus one corroborating data point: the user
plugged the programmer into a Mac and read its USB descriptor from System
Information.

**tl;dr.**
- Vendor software: 32-bit PE built with Embarcadero C++Builder (VCL + JVCL +
  DevExpress + Raize + vg_scene + Brian Gladman AES).
- PC ↔ programmer link: **raw USB HID**, 64-byte reports, Report ID `0x04`,
  VID `0x0471` / PID `0x13AA` (NXP / "Stone Laboratories inc.",
  `iProduct = "USBBootloader V1.3"`).
- `.sfw` firmware files: **AES-128** with a fixed key of `16 × 0x54`
  (= ASCII `"TTTTTTTTTTTTTTTT"`). The first 16 bytes are ECB-decrypted to a
  `[uint32_le length][12 × 'x']` header; the rest is CBC-decrypted with
  `IV = 0` to produce an **ASCII text stream** combining a handshake line, a
  set of sector-erase commands, and **standard Intel HEX** records
  terminated by `:00000001FF`. All 397 data records in `Axon_Max_Servo_Mode`
  have valid Intel HEX checksums.
- Servo MCU: 6,240-byte code image in the range `0x0400..0x1C50`, strongly
  consistent with a small **8051-family** servo MCU with an ASCII-over-UART
  bootloader.

Re-run the end-to-end decryption yourself:

    python3 research/static-analysis/static_analyze.py decrypt \
        downloads/Axon_Max_Servo_Mode.sfw research/decrypted-firmware/Axon_Max_Servo_Mode.plain.bin
    head -20 research/decrypted-firmware/Axon_Max_Servo_Mode.plain.bin

## Files analysed

| File | Size | SHA-256 |
|---|---|---|
| `Axon_Servo_Programming_Software_v1.0.5.exe` | 6,386,176 | `565acbc90998a0508bfd1980c807a14c8a4200a6a0444e8749132b1d982fe286` |
| `Axon_Max_Servo_Mode.sfw` | 17,104 | `6573946de5eeeb3dbf739ea79cfc71c649ba7cbd29bb3e781227a32cdca7db2e` |
| `Axon_Max_Modified_CR_Mode.sfw` | 15,152 | `1e7428593cac311dea15f470f6ae194ff128bef9de134d6679b4fefbd1985631` |
| `Axon_Mini_Servo_Mode.sfw` | 17,216 | `c9f038a854629c1f237e5008c9444a829d2fe5744203bcc959c8fd0c2e95c2c3` |
| `Axon_Mini_Modified_CR_Mode.sfw` | 15,136 | `684ba8d5f904b183e635469b6f55341b0bf7cb49546a6f069d59504cf9ae6380` |

## 1. How the software is written

The `.exe` is a 32-bit Windows GUI PE built with **Embarcadero C++Builder** (the
VCL-based C++ compiler from the Delphi / RAD Studio toolchain). Key evidence:

- PE machine = 0x14c (i386), subsystem = 2 (GUI), compile timestamp = 2021-04-29.
- Section layout `.text / .data / .tls / .rdata / .idata / .edata / .rsrc / .reloc`
  — the separate `.edata` (1.3 MB of RTTI exports) and import layout is the
  classic Delphi/C++Builder shape.
- Imports: `ADVAPI32 KERNEL32 VERSION WINSPOOL COMCTL32 COMDLG32 GDI32 SHELL32
  USER32 IMM32 OLE32 OLEAUT32` — same set a minimal VCL app pulls in.
- RTTI symbol table exports mangled C++Builder names (`@Class@method$qqr…`)
  including both Delphi units (`Classes::TStringList`, `Forms::TForm`) **and**
  C++ namespaces (`Sysutils::Exception`, `System::DelphiInterface<…>`) — the
  mixed form only appears in C++Builder.
- Strings show a `TForm1`/`TForm2`/`Unit1`/`Unit2` layout — the defaults of an
  unrenamed C++Builder project.

### Third-party component packages linked in

From unit/namespace names harvested from the export table and strings:

| Library | Prefix | Role |
|---|---|---|
| VCL | `Classes`, `Controls`, `Forms`, `Graphics` | standard framework |
| DevExpress VCL (ExpressQuantumGrid etc.) | `Cx*` | advanced edit/grid controls |
| Raize Components / Konopka Signature | `Rz*` | panels, tabs, meters, shell dialogs |
| vg_scene / VG-Scene | `Vg_*` | skinning + vector-graphics controls (TvgSpeedButton, TvgBrush, TvgScene, TvgTimer, …) |
| JEDI VCL (JVCL) | `Jvhidcontrollerclass` | HID device enumeration (**main transport**) |
| Imagine | `I*` | drawing helpers |
| Brian Gladman AES (via `TXAes`) | `Xaes` | firmware decryption |
| zlib | `Zlibpas` | compression (likely for the decrypted firmware stream) |
| GDI+ | `Gdip*` | anti-aliased drawing |

## 2. How the device talks to the PC — **it is a HID, not a serial port**

The existing `docs/REVERSE_ENGINEERING_GUIDE.md` assumed the programmer is a
USB-to-serial bridge. **That assumption is wrong.** The DFM of `TForm1` drops a
`TJvHidDeviceController` named `jv1` with two handlers:

```
TJvHidDeviceController jv1
  OnArrival     = jv1Arrival
  OnDeviceUnplug = jv1DeviceUnplug
```

No VendorID / ProductID property is set on the component, which means the code
filters devices itself in `jv1Arrival`. The programmer therefore shows up as a
**raw USB HID device** and the host uses `HidD_*` / `WriteFile` / `ReadFile` on
the HID file handle — not a COM port, no baud rate, no UART.

Dynamically loaded DLLs (present in strings but not in the static imports):
`HID.dll` and `SetupAPI.dll`. The following HID API functions are resolved at
runtime by JVCL's HID controller: `HidD_GetHidGuid`, `HidD_GetPreparsedData`,
`HidD_FreePreparsedData`, `HidD_GetAttributes`, `HidD_GetFeature`,
`HidD_SetFeature`, `HidD_GetManufacturerString`, `HidD_GetProductString`,
`HidD_GetSerialNumberString`, `HidP_GetCaps`, etc.

### 2.1 HID report layout observed in `jv1Arrival`

The arrival handler allocates a 128-byte local buffer, zeroes it, fills the
first bytes, and calls the write-file wrapper with `size = 0x40` (64 bytes):

```
04 8A 00 00 04 00 00 00   00 … 00      ; 64-byte HID output report
^^ ^^       ^^
|| ||       byte[4] = 0x04
|| +-- command byte = 0x8A  (device identify / attach query)
++---- HID report ID = 0x04
```

Then it reads back a 64-byte input report into a second local buffer and
inspects specific offsets:

```asm
cmp byte [ebp-0x177], 1   ; rx[1] must be 0x01   (ACK / status?)
cmp byte [ebp-0x176], 0   ; rx[2] must be 0x00
cmp byte [ebp-0x173], 3   ; rx[5] — device model      (3 = one family)
cmp byte [ebp-0x171], 1   ; rx[7] — device sub-mode  (1 = a mode)
```

Depending on the `(model, mode)` pair it stores an internal code:

| rx[5] | rx[7] | internal code (`dword @ 0x7c5234`) |
|---|---|---|
| 3 | 1 | `0x352` |
| 4 | 1 | `0x357` |
| other | — | 0 (treated as "unknown") |

`0x352` vs `0x357` almost certainly correspond to the MINI+/MAX+ variants (and
the two modes to Servo / Modified CR).

Further into the arrival handler, eight bytes from the response starting at
`rx+8` are copied to an internal field, `'*'` bytes are rewritten to `' '`
(space padding → trim), the result is used as the **servo display name** and
two of the bytes are stashed at `byte @ 0x7c51e9` and `byte @ 0x7c51ea`. These
two bytes are later compared to bytes loaded out of a firmware file; if they
don't match, the UI raises *"Error 1030: Firmware is incorrect."*

### 2.2 The global 64-byte I/O scratch buffers

Every post-arrival command builds its report in a **shared global TX buffer**
at VA `0x7c52ac` and reads the reply into a **shared RX buffer** at `0x7c526c`:

```
0x7c52ac  TX buffer (64 bytes)
0x7c526c  RX buffer (64 bytes)
0x7c52ec  scratch dword — WriteFile/ReadFile `out BytesTransferred`
0x7c52f4  last-status word
0x7c5184  current TJvHidDevice* pointer ("jv1.CurrentDevice" selection)
```

The TX packet structure that every observed command writes is:

```
tx[0]  = 0x04              ; HID report ID (constant)
tx[1]  = <command byte>
tx[2]  = <arg / sub-cmd>
tx[3]  = <arg>
tx[4]  = <arg>
tx[5..] = payload bytes
```

There are **21 direct references** to the `jv1` device pointer in `.text`
(file offsets below), each of which corresponds to a distinct command site:

```
0x403391  arrival identify  (cmd 0x8A, from local stack buffer, not the global)
0x4033dd    "           reply read
0x403a65  disconnect/housekeeping
0x403b05      idem
0x403b8d  post-arrival refresh (calls 0x4cc1b4)
0x403f43  shutdown path (calls 0x700f54 — JvHidDevice cleanup)
0x403f58        idem
0x403f6d        idem
0x40484d  command site
0x404880        reply
0x4049a7  command site
0x4049d7        reply
0x406731
0x4067b3
0x4067d6
0x407e96
0x407eb9
0x4082c7  command site (single-byte arg from stack)
0x408319
```

These are the function addresses to walk next to enumerate every opcode.

### 2.3 The two low-level JVCL I/O wrappers

Both WriteFile and ReadFile entry points are standard JVCL `TJvHidDevice`
methods, fastcall ABI (ECX = this, EDX = buffer, EAX = size), with one stack
arg (`out BytesTransferred`):

- `0x4cd00c` — **WriteFile wrapper** (uses file handle at `[this+0x0c]`)
- `0x4ccfcc` — **ReadFile wrapper** (uses handle at `[this+0x10]`, overlapped)
- `0x4cd0a4` — **second WriteFile** (handle at `[this+0x14]`) — probably the
  `HidD_SetFeature` path for Feature reports

Both ultimately call Win32 `WriteFile` / `ReadFile` at their imported stubs.

### 2.4 Two layers of HID send helpers above those wrappers

The `.exe` has **two** different HID-send helpers built on top of those raw
`WriteFile` / `ReadFile` wrappers, used for two different purposes:

**Layer A — `FUN_00408220(form, cmd, buf, len)` — "fixed 22-byte frame"**

A short, fire-and-forget send with its own symmetric receive `FUN_004082f0`.
Writes the constant preamble `[0x04, cmd, len, payload…]` into the global
TX buffer at `0x7c52ac` and calls `WriteFile`. It is **only** called from
inside the firmware-upload handler `FUN_004065b0` — seven sites:

| callsite    | cmd    | payload len | purpose (inferred) |
|-------------|--------|-------------|--------------------|
| `0x40682d`  | `0x80` | 5 bytes     | enter-update handshake |
| `0x406cda`  | `0x81` | 22 bytes    | firmware-mode identify |
| `0x4078cd`  | `0x82` | 22 bytes    | first data-streaming variant |
| `0x407bf0`  | `0x82` | 22 bytes    | same (second call) |
| `0x407f05`  | `0x83` | 22 bytes    | second data-streaming variant |
| `0x408026`  | `0x83` | 22 bytes    | same |
| `0x408847`  | `0x83` | 22 bytes    | verify / post-write |

None of these are used for runtime parameters — they are exclusively the
firmware-upload protocol.

**Layer B — `FUN_00404900` / `FUN_004047d0` — "chunked address-indexed
read/write"**

A pair of helpers that implement a generic **"write N bytes starting at
16-bit address A"** / **"read N bytes starting at A"** primitive, chunking
any length greater than 59 bytes into multiple HID reports. The
decompiled write helper is essentially:

```c
while (remaining != 0) {
    chunk = remaining < 0x3c ? remaining : 0x3b;
    Sleep(25);
    tx[0] = 0x04;             // HID report ID
    tx[1] = cmd_byte;         // caller-supplied opcode
    tx[2] = addr >> 8;        // big-endian address
    tx[3] = addr & 0xff;
    tx[4] = chunk;
    memcpy(&tx[5], buf, chunk);
    WriteFile(&tx, 64);
    ReadFile(&rx, 64);        // status read
    if (rx[1] == 0) return FAIL;
    addr += chunk;
    buf  += chunk;
    remaining -= chunk;
}
return OK;
```

Signature (fastcall): `(form /*EAX*/, cmd_byte /*DL*/, addr_word /*CX*/,
buf /*stack*/, len_word /*stack*/) -> ok`.

So a 95-byte block read is actually **two HID reports** on the wire — one
of 59 bytes at `addr=0`, then one of 36 bytes at `addr=59` — with a 25 ms
delay between them. The "address" field is a virtual address inside the
servo's exposed memory window, not a flash address, and the chunking +
address auto-advance is entirely a host-side convenience.

## 2.5 The real command vocabulary

Enumerating every direct call to the Layer-B helpers and the raw WriteFile
wrapper, the full set of HID command bytes the GUI ever emits is:

| cmd   | verb   | typical addr | typical len | used by                                                        | purpose |
|-------|--------|--------------|-------------|----------------------------------------------------------------|---------|
| `0x5A` | read  | `0x0000`     | `1`         | `FUN_00408b90`                                                 | single-byte status / probe |
| `0x80` | write | —            | 5           | firmware update only (via Layer A)                             | enter-update handshake |
| `0x81` | write | —            | 22          | firmware update only (via Layer A)                             | firmware-mode identify |
| `0x82` | write | —            | 22          | firmware update only (via Layer A, 2 callers)                  | data-stream variant A |
| `0x83` | write | —            | 22          | firmware update only (via Layer A, 3 callers)                  | data-stream variant B |
| `0x8A` | read  | `0x0000`     | 4-byte req  | `jv1Arrival` (arrival identify), `FUN_00403ffc`                | **IDENTIFY** — returns model byte + mode byte + 8-byte model-ID string |
| `0x90` | write | `0x0100`     | 32          | `FUN_00404a28` (init-time self-test)                           | generic "write N bytes at virtual address A" (test ping) |
| `0x91` | read  | `0x0000`     | 32          | `FUN_00404a28` (init-time self-test)                           | generic "read N bytes at virtual address A" (test ping) |
| `0xCB` | write | `0x0000`     | `0x5F` (95) | `FUN_00403060` ("Write parameters" button handler)             | **WRITE CONFIG BLOCK** — commits the shadow at `0x7c5189` to the servo |
| `0xCD` | read  | `0x0000`     | `0x5F` (95) | `jv1Arrival`, `FUN_00403060`, `FUN_00403ffc`, `FUN_0040330c`   | **READ CONFIG BLOCK** — pulls the servo's current config into the shadow |

Note in particular that `0x8A`, `0x90`, `0x91`, `0xCB`, `0xCD` are all just
"some command byte in `tx[1]`" plus "some 16-bit address in `tx[2..3]`" —
there is no separate "command channel" vs "data channel" in this protocol.
The servo firmware's command dispatcher looks only at `tx[1]`:

- `0x5A`, `0x8A`, `0x91`, `0xCD` all mean *"the request is a read, reply
  with `tx[4]` bytes starting at address `tx[2..3]`"*.
- `0x90`, `0xCB` both mean *"the request is a write, take `tx[4]` bytes
  starting at `tx[5]` and put them at address `tx[2..3]`"*.

The only semantic difference between (e.g.) `0x90` and `0xCB` is presumably
which **virtual memory region** on the servo side they map to — `0x90` /
`0x91` seem to speak to the servo's RAM (or an NVM scratchpad at virtual
address 0x0100), while `0xCB` / `0xCD` specifically target the 95-byte
parameter page that maps onto flash `0x1C00..0x1C5E`. Command `0x8A` is a
specialised "identify" opcode whose reply has a different layout
(`rx[5]=model, rx[7]=mode, rx[8..15]=model-ID string`).

## 3. Firmware file (`.sfw`) format — **fully reversed**

Every `.sfw` is a multiple of 16 bytes and has a two-stage structure:

```
offset 0x00..0x0F   header  (16 bytes)  — AES-128-ECB, key = "TTTTTTTTTTTTTTTT"
offset 0x10..EOF    payload (16N bytes) — AES-128-CBC, IV = 0, same key
```

The key (`puVar11` in the `AESDecFile` callsite) is filled at runtime by a
single `FillChar(&stack_buf, 0x54, 16)` in the firmware-upload handler — see
§3.3. **No part of the key is in `.data` or `.rodata`**; my earlier
hypothesis that it might be stored as a hex string there was wrong.

### 3.1 Decrypted header layout

After ECB-decrypting the first 16 bytes with the 16-byte `'T'` key:

```
offset  type        value
  0..3  uint32_le   payload_length  (the number of plaintext bytes that
                                     follow the header, BEFORE any padding
                                     that rounded the file to a 16-byte
                                     boundary)
  4..15 12 × byte   0x78 0x78 … 0x78   (ASCII 'x' × 12, magic)
```

The `AESDecFile` routine at VA `0x4c4e94` validates the magic by checking
the two bytes at global `DAT_007c60cc` / `DAT_007c60cd` (== `'x' 'x'`)
immediately after the ECB call. This corresponds to the "Error 1030:
Firmware is incorrect." path if either the length field or the magic is
wrong, and to "Error 1031" if the length is not a multiple of 16.

For the four shipped firmwares:

| file                                   | `payload_length` | ct length − 16 | overhead |
|----------------------------------------|-----------------:|---------------:|---------:|
| `Axon_Max_Modified_CR_Mode.sfw`        |           15,121 |         15,136 |       15 |
| `Axon_Max_Servo_Mode.sfw`              |           17,082 |         17,088 |        6 |
| `Axon_Mini_Modified_CR_Mode.sfw`       |           15,117 |         15,120 |        3 |
| `Axon_Mini_Servo_Mode.sfw`             |           17,189 |         17,200 |       11 |

(The "overhead" column is the zero-padding bytes at the end of the last
block that are *not* part of the plaintext.)

### 3.2 Decrypted payload — ASCII with Intel HEX inside

Once the header is consumed, the remaining ciphertext is decrypted with
**AES-128-CBC, IV = 16 × 0x00**, and the first `payload_length` bytes of
the result are the plaintext. The plaintext is **7-bit ASCII**, CRLF-line
oriented, with this structure:

```
@0801<model-id>\r\n                      ; 1 handshake / identify line
$0400\r\n                                 ; N sector-erase lines (0x200-step)
$0600\r\n                                 ;   addresses are 16-bit hex, one
…                                         ;   per flash page to be erased
$1C00\r\n
:LLAAAA00DD…DDCC\r\n                      ; standard Intel HEX data records
:LLAAAA00DD…DDCC\r\n                      ;   LL = 0x10 for full-width records,
…                                         ;   AAAA = 16-bit load address,
:00000001FF\r\n                           ;   00 = data, 01 = EOF, CC = 8-bit
                                          ;   two's-complement checksum
```

Observations from the four shipped firmwares:

- Every file has a `@0801…` handshake line. The suffix after `0801` is the
  servo model ID: `SA81BHMW` for both MAX firmwares and `SA33` for both
  MINI firmwares.
- Every file has **exactly 13 sector-erase lines** at addresses
  `0x0400, 0x0600, 0x0800, … 0x1C00` (0x200-byte stride — i.e. **512-byte
  flash pages**).
- All Intel HEX records have `LL = 0x10` (16 data bytes per record) and
  valid checksums. `Axon_Max_Servo_Mode.sfw` has 397 data records + 1 EOF.
- The data address range is `0x0400..0x1C50` — an exact match for the
  erased region, i.e. the firmware fills every page it erased.
- At flash address `0x1C40`, **every firmware embeds its model ID as an
  8-byte ASCII string**: `"SA81BHMW"` for MAX, `"SA33****"` for MINI
  (padded with `'*'` — hence the `'*'`→`' '` fix-up we see in the HID
  arrival handler when it displays the servo name).
- At flash offset `0x1C5F` the "mode" byte is **`0x00` for Modified CR** and
  **`0x01` for Servo Mode**. That single byte is the only content
  difference between the Servo-mode and CR-mode firmware for a given
  servo family. These two bytes (`0x1C40` and `0x1C5F`, read back from the
  servo by the `0x8A` identify HID command) are what the programmer
  caches at VAs `0x7c51e9..0x7c51ec`.

### 3.3 How the host builds the key

In the firmware-upload handler `FUN_004065b0`, at VA `0x406b27`:

```asm
0x00406b27:  push    0x10                     ; count = 16
0x00406b29:  push    0x54                     ; fill byte = 0x54 ('T')
0x00406b2b:  lea     eax, [ebp - 0x300]       ; dest = key buffer
0x00406b31:  push    eax
0x00406b32:  call    FillChar                 ; (FUN_00786704 == memset)

0x00406b3a:  mov     edx, 0x10                ; arg = 16
0x00406b3f:  mov     ecx, [ebp - 0x100]       ; this form
0x00406b45:  mov     eax, [ecx + 0x2f8]       ; eax = form->xs1 (TXAes)
0x00406b4b:  call    TXAes_SetKeyLen          ; sets this->KeyLen = 16

… path-building code that puts input + output filenames on the stack …

0x00406bde:  lea     ecx, [ebp - 0x300]       ; reload key pointer
0x00406be4:  push    ecx                      ; push as 4th arg to AESDecFile
…
0x00406c2f:  call    TXAes_AESDecFile         ; decrypt .sfw -> .dec tmp file
```

`[ebp - 0x300]` is touched exactly twice in the entire 6,965-byte handler:
the `FillChar` write above, and the `push ecx` that forwards it as the
`puc key` argument to `AESDecFile`. **Therefore the key is, unconditionally,
16 bytes of 0x54** — ASCII `"TTTTTTTTTTTTTTTT"`.

Reproduce:

```bash
python3 research/static-analysis/static_analyze.py decrypt \
    downloads/Axon_Max_Servo_Mode.sfw \
    research/decrypted-firmware/Axon_Max_Servo_Mode.plain.bin
```

### 3.4 Encryption engine

```
TXAes (unit Xaes, VMT at @$xp$5TXAes — RVA 0xc5114)
  KeyLen = 16                          ; set in the DFM on TForm1.xs1
  SetKeyLen(int)                       ; @ VA 0x4c4930
  AESEncBlk / AESDecBlk                ; single-block ECB primitives
  AESEncBuf / AESDecBuf                ; buffer-based
  AESEncFile(char* in, char* out, uchar* key)
  AESDecFile(char* in, char* out, uchar* key)   ; @ VA 0x4c4e94
  StrToHex / HexToStr                  ; hex <-> bytes helpers (unused by
                                        ;  the firmware path — the key is
                                        ;  just a memset, not a hex string)

Algorithm: Brian Gladman's C reference implementation. Forward S-box
(256 × uint32) at file 0x3aa6b8 / VA 0x7ab8b8, second table (the T-box
companion) at VA 0x7abcb8. The decompiled AESDecFile does:

  aes_dec_key(this, key, this->KeyLen, round_keys)
  fread(inFile,  ct,  16)
  aes_dec_blk(this, ct, header_global, round_keys)    <-- ECB on first block
  if header_global[4..5] != "xx":  return -1
  if GetFileSize(inFile) & 0xf:    return -2          <-- not 16-aligned
  remaining = header_global[0..3]                     <-- payload length
  FillChar(prev_ct, 0, 16)                            <-- IV = 0
  while remaining > 0:
      fread(inFile, ct, 16)
      memcpy(cur_ct, ct, 16)
      aes_dec_blk(this, ct, pt, round_keys)
      for i in 0..16:  pt[i] ^= prev_ct[i]             <-- CBC XOR
      memcpy(prev_ct, cur_ct, 16)
      fwrite(outFile, pt, 16)
      remaining -= 16
```

This confirms the mode: **ECB for block 0, CBC with IV = 0 for blocks 1+**.
My earlier "must be ECB all the way, CBC is ruled out" argument was wrong;
the per-file-unique first block is the header (ECB) and the common
`[0x10:0x70]` bytes across files in the same family are just the CBC
output for identical plaintext (the sector-erase preamble with the same
model ID) starting from the same IV = 0.

### Encryption engine in the host

```
TXAes (unit Xaes, VMT at @$xp$5TXAes 0x000c5114)
  KeyLen = 16                          ; set in DFM, so AES-128
  SetKeyLen(int)
  AESEncBlk(const uchar*, uchar*, const aes_ctx*)
  AESDecBlk(const uchar*, uchar*, const aes_ctx*)
  AESEncBuf(uchar*, int, ...)
  AESDecBuf(uchar*, int, ...)
  AESEncFile(const char* in, const char* out, uchar* key)
  AESDecFile(const char* in, const char* out, uchar* key)
  StrToHex(const char* hex, int len, uchar* out, int outlen)
  HexToStr(const uchar* bin, char* out, int)

Internally: Brian Gladman's C reference implementation — the forward S-box
(stored as 256 uint32 entries, each byte zero-extended) is at file offset
0x3aa6b8 / VA 0x7ab8b8. A second 1KB table sits at 0x7abcb8 (used via
`[tab + ebx*4]` together with the S-box). The binary has 36 direct references
to the S-box — the T-table AES hot path.
```

`TXAes` has no published `SetKey` method — the key is passed as a pointer
directly into `AESDecFile(in, out, keyPtr)`. The pointer could be either a
literal `.data` blob or a buffer populated via `StrToHex(someHexString, …)`
before the call. **The AES key itself has not yet been extracted**; next step
is to locate the `AESDecFile` callsite inside the "upload firmware" handler
and read whatever buffer address is loaded into the `puc` argument position.

## 4. UI strings tied to the firmware flow

Extracted from `.data`:

- `"AXON PROGRAMMING SOFTWARE v1"` — main window caption
- `"Servo plug-in!"` / `"Servo remove!"` / `"Adapter plug-in!"` — HID state UX
- `"Servo Name: "`, `"Firmware: "`, `"Servo Angle: "`, `"Servo Neutral: "`,
  `"Damping Factor: "` — parameter fields
- `"Success write parameter!"` — write-param success
- `"Error! Can't set default!"` — default-reset failure
- `"Error 1030: Firmware is incorrect."` — device/firmware mismatch (the 2-byte
  check against `0x7c51e9`)
- `"Error 1031: Firmware is incorrect."` — second mismatch path
- `"Error 1032: Firmware upgrade is terminated."` — abort during flash
- `"Unable to determine the current module model. The firmware you currently
  select is suitable for module [ X ]. If you select an inappropriate firmware
  to update to the current module, it may cause damage. Please select YES to
  update, else please choose No."` — the confirmation prompt when the
  programmer can't read back the plugged-in servo's model (e.g. blank-flash)

The file dialog filter resolves the two extensions:

```
Servo config file (*.svo) | *.svo
Servo firewire file (*.sfw) | *.sfw     ; sic — "firewire" is a typo of "firmware"
```

`.svo` is a *config* file and is also writable from the UI (`dlgSave1` only
offers `*.svo`). `.sfw` is firmware and read-only from the user's perspective.

## 3a. Runtime parameter read/write — how the GUI edits settings

**tl;dr: the GUI never writes individual parameters. Clicking the "Write
parameters" button runs a strict read-modify-write of the whole 95-byte
config block.** The slider / combo / checkbox event handlers just update
local VCL state — there is zero HID traffic on a slider move. All wire
traffic is batched into a single user-initiated commit.

### The commit routine (`FUN_00403060`)

Decompile in `research/static-analysis/ghidra_out/param_read_caller_00403060_FUN_00403060.c`.
Paraphrased:

```c
void WriteParameters(form)  // "Write parameters" button handler
{
    DebugLog("FUN_00403060");
    addr = 0x0000;
    length = 0;

    if (!DAT_007c5231 || !DAT_007c5234 || DAT_007a7246)   // not connected,
        return AddLog("Error 05: Please check connect or...");  // no servo detected,
                                                          // or adapter-only mode

    if (DAT_007c5234 == 0x352) length = 0x5f;   // MAX+ Modified CR
    if (DAT_007c5234 == 0x357) length = 0x5f;   // MAX+ Servo
    if (DAT_007c5234 == 0x2f8) length = 0x5f;   // (a third model, not in
                                                //  the four shipped firmwares
                                                //  — probably MINI+)

    // 1) READ the WHOLE 95-byte config block out of the servo into a
    //    local stack buffer
    if (!ReadHelper(form, cmd=0xCD, addr=0x0000, buf=local_e4, len=95))
        return AddLog("Error 04: Can't read parameter");

    // 2) Refresh the global 95-byte shadow at 0x7c5189 from the fresh read
    memcpy(&DAT_007c5189, local_e4, 95);

    // 3) Overlay the current GUI-control values onto the shadow, using a
    //    per-model "apply sliders" routine that only touches the handful
    //    of bytes that correspond to visible controls for that model
    if (DAT_007c5234 == 0x352) FUN_00405518(form, &DAT_007c5189);
    if (DAT_007c5234 == 0x357) FUN_00406248(form, &DAT_007c5189);

    // 4) Write the (now modified) 95-byte shadow back to the servo as a
    //    single ATOMIC block
    if (!WriteHelper(form, cmd=0xCB, addr=0x0000, buf=&DAT_007c5189, len=95))
        return AddLog("Error 06: Can't write parameter");

    AddLog("Success write parameter!");
}
```

Two things make this unambiguous:

1. The only two callers of the Layer-B **write** helper (`FUN_00404900`) in
   the entire binary are this `WriteParameters` routine and the init-time
   self-test at `FUN_00404a28`. There is literally no per-slider HID send
   path — it does not exist in the binary.

2. The buffer passed to the write helper is `&DAT_007c5189`, a 95-byte
   global. That same global sits immediately adjacent to
   `DAT_007c5184` (the current `TJvHidDevice *`) — it's the GUI's
   "current servo config" shadow, not a stack scratch buffer. The
   refresh in step (2) guarantees the read-modify-write cycle is
   always working from the servo's authoritative copy.

### The on-connect read (`jv1Arrival` + `FUN_00403ffc`)

The arrival handler also uses `0xCD` at `addr=0, len=0x5F` to fetch the
config block immediately after the `0x8A` identify succeeds — it has two
separate call sites for the two models it knows about (`0x352` and
`0x357`). That is how the GUI populates its sliders on connect.

`FUN_00403ffc` (8,480 bytes of decompile) looks like the explicit "Read
parameters" button handler — it issues one `0x8A` identify followed by one
`0xCD` config-block read, then walks the received bytes and updates every
displayed control. Not decompiled in detail here.

### The self-test at connect (`FUN_00404a28`)

Runs immediately after `FUN_00403ffc` and exists to verify the servo's
parameter-transfer path is healthy before the user touches anything:

```c
FUN_004047d0(this, cmd=0x91, addr=0x0000, &local_78, 32);   // read 32 @ 0x0000
if (local_78[0] == 0) {
    FUN_00404900(this, cmd=0x90, addr=0x0100, &local_78, 32);  // write 32 @ 0x0100
    FUN_004047d0(this, cmd=0x91, addr=0x0000, &local_78, 32);   // read again
    if (local_78[0] == 1) AddLog("Initial read parameter....");
}
```

The `0x90` / `0x91` opcode pair speaks to a *different* 256-byte virtual
address space than the `0xCB` / `0xCD` parameter window (note `addr=0x0100`
vs `addr=0x0000`), so this probe doesn't disturb user settings. The
expected behavior is that writing 32 bytes to virtual address `0x0100`
causes the servo firmware to flip a flag at virtual address `0x0000` from
`0x00` to `0x01`, which the GUI then reads back and logs.

### How sliders map onto config-block bytes

From `FUN_00406248` (model `0x357`, MAX+ Servo Mode — only 1,004 bytes of
decompile):

```
block[0x12]  <-  form->control[0x3e4]->value       (one byte — a slider)
block[0x25]  <-  bits 0 and 1 driven by one two-bit toggle
block[0x36]  <-  form->control[0x3dc]->value       (one byte — another slider)
```

That's it. For MAX+ Servo mode, the "Write parameters" button only ever
modifies **3 bytes** out of the 95-byte block. Everything else is
round-tripped untouched from step (1) above.

From `FUN_00405518` (model `0x352`, MAX+ Modified CR mode — 7,693 bytes of
decompile — much richer control surface):

```
block[0x00..0x03]  <-  one of 5 fixed 4-byte presets, chosen by a combo
                        box. The five presets are:
                          (0x3B 0xD0 0x0B 0xF6)  <-- factory default
                          (0x32 0x3E 0x15 0x88)
                          (0x2D 0x75 0x1A 0x51)
                          (0x0B 0x3E 0x03 0x1C)
                          (0x19 0x1F 0x0A 0xC4)
block[0x04]        <-  slider value from form->control[0x358]
block[0x05]        <-  same slider value copied a second time
block[0x06]        <-  (form->control[0x380]->value) - 0x80   (signed trim,
                                                              range -128..+127)
block[0x0C]        <-  (form->control[0x378]->value + 1) * 0x10
block[0x25]        <-  bit-flags (bits 0,1,2,3,4,5,6,7) driven by several
                        radio buttons / checkboxes
block[0x35..0x3A]  <-  six bytes, derived from a computed value — matches
                        the "three 16-bit values" triple I flagged earlier
                        in §3.3. These are almost certainly three angle
                        limit stops (e.g. left / center / right).
```

Cross-referencing these offsets against the byte-level diff in §3.3:
`0x25`, `0x30..0x32`, `0x35..0x3C` are exactly the positions where the
four shipped `.sfw` factory-default blocks differ from each other. So
the offsets the GUI writes match 1:1 the offsets the shipped firmwares
themselves vary. The config struct is fully internally consistent.

### So: are parameters "just values being poked into the flash memory map"?

**Yes, and the answer is cleaner than I originally thought.** From the
PC's point of view, there is a flat 95-byte virtual address space at
servo address `0x0000..0x005E` that gets read and written with a single
command pair (`0xCD` / `0xCB`). Individual slider events never touch the
wire; the user has to click "Write parameters" to commit.

From the servo firmware's point of view, that virtual window is
**memory-mapped onto the physical flash config page at `0x1C00..0x1C5E`**,
and the `0xCB` command triggers the IAP sequence (copy page to RAM,
apply the incoming 95 bytes, erase page, reprogram from RAM). That whole
erase/reprogram dance is entirely hidden behind the single HID command —
the host never sees it and never has to care about flash wear, page
boundaries, or erase-before-write.

Two corollaries fall out of this:

1. **The `.sfw` "factory defaults" are the same struct the GUI edits at
   runtime**, just physically present in the firmware image at flash
   offset `0x1C00..0x1C5E` instead of being received over HID. So yes,
   flashing a `.sfw` resets whatever customization the user had made,
   because it wipes page `0x1C00..0x1DFF` as part of the firmware-update
   erase list. That's what the ominous "it may cause damage" UI warning
   is about.

2. **The `.svo` file format** (which the GUI's `dlgSave1` exposes via
   `File → Save`) is almost certainly a 95-byte dump of the exact same
   struct. On `File → Open` of a `.svo`, the GUI likely skips the
   `0xCD` read entirely, loads the file directly into the shadow at
   `0x7c5189`, and issues a single `0xCB` write — i.e. "push saved
   settings to servo". Not yet confirmed but strongly implied by the
   shape of what we've already decompiled.

## 4b. USB device identity (corroborated by real hardware)

The user plugged the physical programmer into a Mac and read System
Information. The HID descriptor says:

```
Product:        USBBootloader V1.3
Manufacturer:   Stone Laboratories inc.
Vendor ID:      0x0471   (Philips Semiconductor / NXP)
Product ID:     0x13AA
Serial:         (not provided)
Speed:          12 Mb/s  (USB 1.1 full-speed)
Bus power:      446 mA
```

This matches the filter found in the vendor software — at VA `0x403a71`
the arrival handler sets up `VID=0x471 / PID=0x13AA` before calling into
`TJvHidDeviceController`. Important implications:

- VID `0x0471` means the MCU silicon in the programmer is almost certainly
  an **NXP LPC** series part (the cheap USB-FS families are LPC11Uxx /
  LPC13xx / LPC17xx). "Stone Laboratories inc." is the OEM; Axon is
  rebranding their hardware.
- `iProduct = "USBBootloader V1.3"` is the same string you'd see on a
  stock NXP MCU running its reference USB bootloader example. The Axon
  programmer appears to always present with this identity — not just
  during programmer-firmware updates — which is consistent with the host
  software tunneling the "real" protocol over a plain HID report channel
  rather than using a vendor-specific interface descriptor.
- 446 mA bus draw is high for a passive programmer; the programmer is
  supplying bus power to the attached servo on the 3-wire cable.

For the client implementation this means the Web HID filter should be:

```js
navigator.hid.requestDevice({
  filters: [{ vendorId: 0x0471, productId: 0x13aa }]
})
```

## 5. What still needs to be done

With the .sfw format fully reversed and the HID transport characterized,
the remaining work is entirely about **runtime telemetry** — which
requires the physical programmer.

1. [x] ~~Locate the AES key.~~ `b"T"*16` — done.
2. [x] ~~Decrypt one `.sfw`.~~ All four decrypt to valid Intel HEX images.
3. [ ] **Enumerate HID opcodes.** Walk the 21 HID callsites in §2.2, dump
       the bytes each one sets in the TX buffer at `0x7c52ac`, and build a
       `(cmd_byte, args, response_shape)` table. This is pure decompiler
       work now that Ghidra 12 + our `research/static-analysis/ghidra_scripts/axon_hunt_aes.py`
       flow is set up.
4. [ ] **Enumerate parameter IDs.** The parameter-UI event handlers
       (`rztrNeutralChange`, `rztrDampingChange`, `cxhyprlnkdt1Click`, …)
       each end in a HID write; each gives us a "write parameter <N>"
       opcode.
5. [ ] **Capture a session** with the real hardware on Windows under
       USBPcap or API-Monitor. Validate every opcode derived statically
       against the capture before writing a client.
6. [ ] **Implement the Web HID client** with the filter above and the
       command table built in step 3/4. The firmware-upload path is
       trivially: decrypt `.sfw` with `"TTTTTTTTTTTTTTTT"` → split
       plaintext into lines → send each line to the programmer (wrapped
       in a 64-byte report with the appropriate write opcode, which is
       step 3 above).

One additional statically-verifiable item that would be worthwhile:

7. [ ] **Decompile `FUN_004065b0`** more thoroughly in Ghidra and identify
       the line-by-line transmission loop (the code that takes the
       plaintext stream produced by `AESDecFile`, reads it back, and
       writes each line into the HID TX buffer). The opcode used for
       those writes is the firmware-update "send line" command, which
       is probably what the `0x4049a7 / 0x4049d7` and `0x4067b3 / 0x4067d6`
       callsite pairs do.

## Appendix A — notable addresses

| Symbol | File offset | VA |
|---|---|---|
| Current `TJvHidDevice*` global | — | `0x7c5184` |
| TX report buffer (64 B) | — | `0x7c52ac` |
| RX report buffer (64 B) | — | `0x7c526c` |
| BytesTransferred / last error | — | `0x7c52ec / 0x7c52f4` |
| Detected device internal code | — | `0x7c5234` |
| Cached servo signature (2 B) | — | `0x7c51e9 / 0x7c51ea` |
| AES forward S-box (256 × u32) | `0x3aa6b8` | `0x7ab8b8` |
| Second AES table (1 KB) | `0x3aaab8` | `0x7abcb8` |
| `jv1Arrival` handler | `0x270c` | `0x40330c` |
| WriteFile JVCL wrapper | `0x4c60c` | `0x4cd00c` |
| ReadFile JVCL wrapper | `0x4c5cc` | `0x4ccfcc` |
| `"Error 1030: Firmware is incorrect."` literal | `0x3a658a` | `0x7a778a` |
| Error-1030 emit site | `0x6702..0x711c` | `0x4070fc..0x40711c` |
| `TXAes` VMT (RTTI export) | — | RVA `0xc5114` |

## Appendix A.2 — new addresses found via Ghidra

| Symbol | VA |
|---|---|
| Firmware-upload handler (`FUN_004065b0`) | `0x004065b0..0x00408105` (6,965 B) |
| `TXAes::SetKeyLen` | `0x004c4930` |
| `TXAes::AESDecFile` | `0x004c4e94` |
| `TJvHidDevice::WriteFile` (fastcall) | `0x004cd00c` |
| `TJvHidDevice::ReadFile` (fastcall) | `0x004ccfcc` |
| `TJvHidDevice::GetProductName` | `0x004cc1b4` |
| `FillChar` / memset | `0x00786704` |
| HID VID/PID filter site (arrival handler) | `0x00403a6c..0x00403a76` |
| `FillChar(&key_buf, 0x54, 16)` callsite | `0x00406b27..0x00406b37` |
| `AESDecFile` call in firmware handler | `0x00406c2f` |

## Appendix B — tools used

- `curl` for the downloads, `file` / `shasum` / `strings` for first-pass
  orientation.
- **CPython 3 + `pefile` + `capstone`** (`pip install --user pefile capstone
  pycryptodome`) for quick PE probes, targeted linear disassembly,
  xref scans, and the `.sfw` decrypter (`research/static-analysis/static_analyze.py`).
- **Ghidra 12.0.4 PUBLIC** (`~/tools/ghidra_12.0.4_PUBLIC/`), downloaded
  from the NSA GitHub release. Launched headlessly via
  `support/analyzeHeadless` with **Amazon Corretto JDK 21** as
  `JAVA_HOME` (Android Studio's bundled JBR 21 also worked for plain
  headless use but triggers a SIGBUS in `CodeHeap::allocate` when
  embedded in a Python process via PyGhidra/JPype — see below).
- Ghidra post-processing scripts under `research/static-analysis/ghidra_scripts/`:
  - `axon_hunt_aes.py` — **Jython 2.7** script that runs in `analyzeHeadless`,
    locates the "Error 1030" string, byte-scans `.text` for the xref (the
    string sits inside a Delphi `AnsiString` header so
    `getReferencesTo()` alone returns nothing), walks backwards from the
    ref to find a `55 8B EC` function prologue, force-disassembles and
    creates a function there, decompiles it and all direct callees, and
    writes the results to `research/static-analysis/ghidra_out/`.
  - `axon_hunt_aes_pyghidra.py` — **CPython 3** equivalent using
    `pyghidra.open_program()`. Left in the repo as documentation — on
    Apple Silicon macOS it **does not work** because the Python
    interpreter lacks the `MAP_JIT` entitlement, so when JPype loads
    `libjvm.dylib` into the Python process the JVM's C1/C2 compiler
    can't allocate executable memory and the process dies with SIGBUS
    in `CodeHeap::allocate`. No amount of `-XX:*CodeCacheSize=` tuning
    helps — it's the underlying `mmap` call that fails. On Linux or
    Intel Macs this path should work fine.
- **`pip install pycryptodome`** for the AES implementation used by
  `research/static-analysis/static_analyze.py decrypt`.

### Repro of the Ghidra walk

```bash
# One-time: download Ghidra 12.0.4 from the NSA release and unpack to
# ~/tools/ghidra_12.0.4_PUBLIC/, then install a vanilla JDK 21.

export JAVA_HOME=~/tools/corretto21/Contents/Home
mkdir -p /tmp/ghidra_proj

# Ghidra 12 defaults .py scripts to the PyGhidra provider, which refuses
# to run under plain analyzeHeadless. Disable the provider so .py falls
# through to the Jython 2.7 provider that still ships in /Ghidra/Features/Jython.
mv ~/tools/ghidra_12.0.4_PUBLIC/Ghidra/Features/PyGhidra{,_disabled}

# First run: import + auto-analyze (~3 min on an M-series Mac).
~/tools/ghidra_12.0.4_PUBLIC/support/analyzeHeadless \
    /tmp/ghidra_proj axon \
    -import downloads/Axon_Servo_Programming_Software_v1.0.5.exe \
    -scriptPath research/static-analysis/ghidra_scripts \
    -postScript axon_hunt_aes.py

# Subsequent runs: skip re-analysis, just re-run the script.
~/tools/ghidra_12.0.4_PUBLIC/support/analyzeHeadless \
    /tmp/ghidra_proj axon \
    -process Axon_Servo_Programming_Software_v1.0.5.exe \
    -noanalysis \
    -scriptPath research/static-analysis/ghidra_scripts \
    -postScript axon_hunt_aes.py

# Restore PyGhidra when done so the install isn't broken for future use.
mv ~/tools/ghidra_12.0.4_PUBLIC/Ghidra/Features/PyGhidra{_disabled,}
```

Outputs land in `research/static-analysis/ghidra_out/`:
`firmware_handler.c`, `004c4e94_atTXAesatAESDecFileqqrpct1puc.c`,
`004c4930_atTXAesatSetKeyLenqqri.c`, `firmware_handler_datarefs.txt`,
`data_printable_runs.txt`, and a decompilation of every direct callee
of the firmware-upload handler.

Then:

```bash
python3 research/static-analysis/static_analyze.py decrypt \
    downloads/Axon_Max_Servo_Mode.sfw \
    research/decrypted-firmware/Axon_Max_Servo_Mode.plain.bin
```

gives you the plaintext Intel HEX firmware image that the programmer
sends to the servo over the 3-wire bus.

---

## Wire protocol decoded (2026-04-09)

Captured on the signal wire with a Saleae Logic 2 while the vendor exe
ran one **Read** cycle against an Axon Mini. Analyzer: Async Serial,
**9600 baud**, 8N1, inverted=no. Decoded data is in
`research/saleae-captures/0xcd-data.csv`. Re-parse any future capture with:

    ~/tools/axon-hw-venv/bin/python3 research/static-analysis/decode_saleae_csv.py \
        research/saleae-captures/0xcd-data.csv --head 40

### Frame format

The Axon dongle is a **transparent proxy**. The HID command byte that
the exe sends (`0x8A` identify, `0xCD` read, `0xCB` write) is the *same*
byte that appears on the 3-wire link as the Dynamixel-v1 `INSTR` field.
Every wire frame has the form:

```
FF FF <ID> <LEN> <INSTR | ERR> <PARAMS...> <CHKSUM>
```

- `ID` — servo id; observed `0x01`.
- `LEN` — bytes from `INSTR/ERR` through `CHKSUM` inclusive (i.e.
  `1 + N + 1` where `N` is the parameter count).
- `CHKSUM` — **bitwise NOT** of the running sum of
  `ID + LEN + INSTR + PARAMS`. This is not two's complement; it is
  `(~sum) & 0xFF`.
- Host→servo frames carry `INSTR`. Servo→host replies carry an `ERR`
  byte in the same position (`0x00` = OK).

### Identify (`0x8A`) — keepalive poll, 300 ms cadence

```
host:  FF FF 01 04 8A 00 04 6C
servo: FF FF 01 06 00 03 21 01 08 CB
```

The host's two params are `00 04` (meaning TBD; possibly the chunk size
register the servo should prepare). The servo's 4 reply params are
`03 21 01 08`. Two of them look like a servo-side status/model id but
are not necessary for further reverse engineering — the mere fact that
a well-formed reply arrives is the PRESENT indicator.

### Read (`0xCD`) — two chunks cover the whole 95-byte config block

When the user clicks **Read**, the exe fetches the config block in
exactly two transactions:

```
host:  FF FF 01 04 CD 00 3B F2            ; read addr=0x00, len=0x3B (59)
servo: FF FF 01 3D 00 <59 data bytes> <chksum>

host:  FF FF 01 04 CD 3B 24 CE            ; read addr=0x3B, len=0x24 (36)
servo: FF FF 01 26 00 <36 data bytes> <chksum>
```

- The HID-side address parameter the exe sends is a 16-bit value
  `(addr_hi, addr_lo)`, but the dongle drops `addr_hi` before
  forwarding to the wire — the on-wire address field is a single byte
  because the config block is only `0x5F` bytes long.
- 59 + 36 = **95 bytes**, matching the `.svo` file size and the 95-byte
  buffer the exe allocates (see `FUN_00405518` in the static RE).
- Both chunks are requested back-to-back with ~128 ms between them.
- We captured two consecutive Read cycles — the reply bytes were
  **byte-for-byte identical** across both passes, so read is
  deterministic and the capture is trustworthy.

### Stitched 95-byte config block from the live Mini

```
  0x00  3b d0 0b f6 82 82 80 03 00 3c 00 50 1e 00 00 c8  ;........<.P....
  0x10  09 dc dc dc 29 21 1d 19 14 00 3c 00 3c 00 3c 00  ....)!....<.<.<.
  0x20  00 00 00 00 01 e3 c0 00 50 00 50 00 50 00 00 00  ........P.P.P...
  0x30  16 0a 16 00 00 78 32 64 50 50 64 23 e3 00 00 00  .....x2dPPd#....
  0x40  53 41 33 33 2a 2a 2a 2a 00 00 00 00 00 00 00 00  SA33****........
  0x50  00 00 00 00 00 00 00 00 00 00 00 00 00 00 01     ...............
```

Key landmarks:

- **`0x00..0x06` = `3B D0 0B F6 82 82 80`** — stable header/magic.
  Identical to the first seven bytes of `vendor/samples/mini.svo`, confirming
  that a `.svo` file is a raw dump of this exact 95-byte region.
- **`0x40..0x47` = `"SA33****"`** — ASCII model id string. This is the
  byte range the exe's `rd addr=0x40 len=8` model-id probe reads, and
  it is exactly where we guessed it would be.
- **`0x5E = 0x01`** — end-of-config sentinel / layout version byte.
- Diff vs `vendor/samples/mini.svo`: 67/95 bytes match. Every mismatch is
  `wire=<non-zero>` vs `svo=0x00`, i.e. `mini.svo` was saved when the
  servo was in a more-zeroed state (defaults / unconfigured), whereas
  the live servo has populated limits, calibration curves, and
  adjustable parameters. The `.svo` file format is not a partial view
  — it's the full 95 bytes, there's just less live data in that
  particular capture.

### Wire timing at 9600 baud

- One byte = 10 bits (1 start + 8 data + 1 stop) = **1.042 ms**.
- Full 65-byte read-reply frame = **~67.7 ms** on the wire.
- Full 42-byte second-chunk reply = **~43.7 ms**.
- Two-chunk full Read cycle (incl. ~128 ms gap) = **~260 ms** end-to-end.

This timing is important because our `libusb` test scripts were
issuing the `0xCD` HID write and then immediately reading the IN
endpoint with a 500 ms timeout. 500 ms is comfortably longer than
the wire reply, so timeout is *not* the cause of the garbage data
we were seeing on libusb — something else is going on with the
dongle's HID→wire path when driven outside the exe's exact
command sequence. See the next section.

### HID reply format — the dongle IS a transparent proxy when primed

Confirmed via dual capture: `research/python-tests/axon_libusb_test7.py` driving
the dongle while Saleae captured the wire simultaneously. Results
in `research/saleae-captures/dual_test7_623.csv` (wire) and in the script's
stdout (HID). The wire showed the exact same `0xCD` frames the
vendor exe emits, and the HID reply bytes match the wire reply
bytes **byte-for-byte**.

**The HID reply format:**

```
rx[0]       = 0x04            HID report ID
rx[1]       = status_hi       0x01 = OK, else the command byte echoed back (NACK)
rx[2]       = status_lo       0x00 = OK, 0xFA = "no servo", 0x02 = command not executed
rx[3]       = addr echo       (the addr we sent in tx[3])
rx[4]       = length echo     (the length we sent in tx[4])
rx[5..5+N]  = wire data       (exactly N bytes from the servo's wire reply)
rx[5+N..63] = zero padding
```

**`rx[1] == 0x01 and rx[2] == 0x00` is the "reply is valid" gate.**
If either byte deviates, the `rx[5..]` data is stale or garbage
and must not be trusted. Earlier confusion in
`axon_libusb_test2.py` (which produced 29 scattered bytes of a
so-called "curated view") was actually just `rx[2] == 0x02`
NACK output — the dongle's equivalent of "command not executed,
here's whatever was in the buffer." A valid reply has
`rx[2] == 0x00`.

**Prime state matters.** The dongle only executes `0xCD`/`0xCB`
commands when it is in "servo primed" state, which is entered
during the servo's plug event AFTER the adapter is already
attached. See the "Dongle state machine" memory for the full
rules — in particular, `dev.reset()` wipes this state and puts
the dongle into a zero-wire-output cold mode that cannot be
recovered from in software.

**Reference Python primitive for a validated read:**

```python
def read_config_chunk(dev, addr: int, length: int) -> bytes:
    tx = bytearray(64)
    tx[0] = 0x04        # report id
    tx[1] = 0xCD        # read
    tx[2] = (addr >> 8) & 0xff
    tx[3] = addr & 0xff
    tx[4] = length
    dev.write(EP_OUT, bytes(tx), timeout=500)
    time.sleep(0.08)    # ~68ms wire reply at 9600 baud + overhead
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

A write should follow the same HID→wire passthrough pattern with
`0xCB` as the command byte and the data bytes placed starting at
`tx[5]`. Still TBD whether write also requires a preceding read
to arm — see task #19.

### Takeaways for the replacement implementation

- **We do not need the dongle's HID read path to be figured out
  for the happy-path use case.** Because the on-wire protocol is
  now fully known, we can drive the dongle purely as a
  "transparent UART bridge": send it the exact bytes to emit on
  the wire, let it relay the servo's reply back. This is the same
  mode the vendor exe already uses for identify (`0x8A`), and
  identify works over libusb today.
- The `.svo` format is definitively "raw 95-byte config block" —
  no header, no checksum, no encryption. Saving to / loading from
  `.svo` is just memcpy.
- The `0xCD` read takes two chunks (`(0x00, 0x3B)` + `(0x3B, 0x24)`).
  The replacement CLI's `--read` command must issue both and
  concatenate the 59+36 data bytes in order.
- The replacement CLI's `--write` command issues `0xCB` writes in
  the same chunking — see next section.

### Write (`0xCB`) — decoded from `research/saleae-captures/0xcb-data.csv`

Clicking **Write** in the vendor exe produces a full
read-modify-write cycle on the wire:

```
t=2.435  HOST:  FF FF 01 04 CD 00 3B F2              ; read chunk 0
t=2.445  SERVO: FF FF 01 3D 00 <59 data bytes> <chk>
t=2.570  HOST:  FF FF 01 04 CD 3B 24 CE              ; read chunk 1
t=2.580  SERVO: FF FF 01 26 00 <36 data bytes> <chk>
t=2.672  HOST:  FF FF 01 3E CB 00 <59 data bytes> <chk>  ; write chunk 0
t=2.787  HOST:  FF FF 01 27 CB 3B <36 data bytes> <chk>  ; write chunk 1
```

All checksums OK (verified by `research/static-analysis/decode_saleae_csv.py`).

**Write frame format:**

```
FF FF <ID> <LEN> CB <addr> <data...> <chksum>
```

where `LEN = 1 (INSTR) + 1 (addr) + N (data) + 1 (chksum)`. For
the two observed chunks:

| chunk | LEN  | addr | data bytes |
|-------|------|------|-----|
| 0     | 0x3E | 0x00 | 59  |
| 1     | 0x27 | 0x3B | 36  |

**No servo ACK on the wire after writes.** Between the chunk 0
write ending at t=2.747s and the chunk 1 write starting at
t=2.787s — a 40 ms gap, comfortably big enough to fit a 1 ms
single-byte ack — the Saleae shows no bytes. Same between the
chunk 1 write's checksum at t=2.836s and the next identify
keepalive at t=2.858s. Writes look **fire-and-forget** on the
1-wire link.

**The exe reads before it writes.** Even though the exe's UI
state holds the config block that the user just edited, it
re-reads both chunks from the servo immediately before writing
them back. Two plausible reasons:
1. The dongle's firmware requires a prior read to "arm" the
   write path (state machine).
2. The exe wants a fresh copy so in-flight servo-side changes
   (temperature? position?) don't get clobbered.

**We haven't determined which yet.** Testable: issue a
`0xCB` write over HID without a preceding `0xCD` read, then
Saleae-capture the wire. If the dongle still emits the `0xCB`
frame, the read-before-write is just an exe choice. If it
swallows the command, the read is arming state we'll need to
replay.

**Cross-capture consistency check.** In the `0xcd-data.csv`
capture, config byte `[0x0C] = 0x1E`. In this `0xcb-data.csv`
capture — taken a few minutes later — both the read *and* the
write have `[0x0C] = 0x10`. The user had changed that byte in
the exe's UI between the two capture sessions, and this capture
shows the Write cycle pushing the new value to the servo. Nice
independent confirmation that:
- the 95-byte layout is stable across sessions,
- `.svo` bytes correspond 1:1 with on-wire config bytes,
- the byte at offset `0x0C` is a *settable parameter* (not a
  live telemetry reading), since it survived a write and the
  subsequent read returned the new value.
