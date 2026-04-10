# Axon Servo Programmer Reverse Engineering Guide

This guide walks through capturing and analyzing USB traffic from the Axon Programmer MK2 to reverse engineer its wire protocol.

> **Update (after static analysis of the vendor software):**
> The Programmer MK2 is **NOT a USB-to-serial bridge** — it is a **raw USB HID
> device**. The vendor GUI (Embarcadero C++Builder / VCL) talks to it via
> `HidD_*` and `WriteFile`/`ReadFile` on the HID file handle, not a virtual COM
> port. The authoritative, up-to-date analysis lives in
> [`FINDINGS.md`](./FINDINGS.md); this document has been annotated below but
> still retains the original serial-era notes for historical context.

## Overview

The Axon Programmer MK2 connects via USB-C and communicates with MK2 series servos. Confirmed from the vendor software:

- The programmer is a **raw USB HID** device — no virtual COM port, no CDC.
- Every I/O is a **64-byte HID report** with **Report ID `0x04`**.
- TX layout: `[0x04, cmd, arg0, arg1, arg2, payload…]` zero-padded to 64 bytes.
- RX layout: 64-byte input report; `rx[1]==0x01, rx[2]==0x00` indicates ACK.
- Host filtering of the device happens inside the `jv1Arrival` event handler
  (the `TJvHidDeviceController` in the form has no VID/PID set in the DFM).
- Firmware files (`.sfw`) are **AES-128-ECB** encrypted with a key hardcoded in
  the host software; the first 16 bytes of each `.sfw` are a per-file header
  left in clear.

Our goal: Capture the HID traffic, decode the command set, and replicate it in a web app (Web HID).

---

## Phase 1: Hardware Identification

### Step 1.1: Identify the HID device (VID/PID)

The Programmer MK2 does **not** enumerate as a COM port — it will NOT appear
under "Ports (COM & LPT)". Instead:

**On Windows:**
1. Plug in the Axon Programmer MK2.
2. Open Device Manager (Win+X → Device Manager).
3. Expand **"Human Interface Devices"** — look for "HID-compliant device" /
   "USB Input Device" that appears when the programmer is attached.
4. Right-click → Properties → Details → Hardware Ids.

You're looking for an entry like `HID\VID_xxxx&PID_xxxx&…`.

**Record these values:**
- Vendor ID (VID): `____________`
- Product ID (PID): `____________`
- Usage Page / Usage: `____________` (from `HidP_GetCaps`, optional)
- Device Path (from `SetupDiGetDeviceInterfaceDetail`): `____________`

### Step 1.2: Sanity check on macOS / Linux (optional)

Without even running the vendor software you can enumerate the device:

```bash
# macOS
ioreg -p IOUSB -l -w 0 | grep -A 20 -i axon

# Linux
lsusb -v                      # look for Axon / HID interfaces
cat /sys/kernel/debug/hid/*   # (root) live descriptors
```

A minimal Python enumeration using `hidapi` also works cross-platform:

```bash
pip install hid
python3 -c "import hid; [print(f\"{d['vendor_id']:04x}:{d['product_id']:04x}  {d['product_string']}\") for d in hid.enumerate()]"
```

### Step 1.3: Why the old "COM port / baud rate" plan no longer applies

Static RE of the vendor software (see `FINDINGS.md`) found `TJvHidDeviceController`
in the main form, 21 direct HID I/O callsites, and zero references to any
serial / COM API. There is no USB-to-serial bridge chip to identify and no
baud rate to recover — the protocol is pure HID report framing.

---

## Phase 2: USB Traffic Capture Setup

### Option A: Wireshark + USBPcap (Recommended, Windows)

#### Install USBPcap

1. Download USBPcap from: https://desowin.org/usbpcap/
2. Install with default options
3. Reboot if prompted

#### Configure Wireshark

1. Open Wireshark
2. Go to Capture → Options
3. Look for "USBPcap" interfaces
4. Select the USB root hub your device is connected to
   - Use Device Manager to find which USB controller
5. Click "Start"

#### Filter for HID traffic

Once capturing, use these display filters — note the transfer types are
**interrupt** (0x01) and **control** (0x02), not bulk, because this is HID:

```wireshark
# Filter by device address (find this in initial enumeration)
usb.device_address == X

# HID input/output reports ride over interrupt transfers
usb.transfer_type == 0x01

# HID SetFeature / GetFeature ride over control transfers
usb.transfer_type == 0x02

# Exclude zero-length packets
usb.capdata

# Combined filter (most useful)
usb.device_address == X && (usb.transfer_type == 0x01 || usb.transfer_type == 0x02) && usb.capdata
```

Useful column additions in Wireshark: `usb.bmRequestType`,
`usb.setup.wValue`, `usbhid.data`. The `usbhid` dissector will parse HID
reports automatically once the interface descriptor has been captured at
plug-in time (so always start capturing **before** plugging the programmer).

### Option B: Dedicated HID monitors

If USBPcap is problematic, these tools capture HID reports directly:

1. **USBlyzer** (Windows): https://www.usblyzer.com/
2. **Bus Hound** (Windows): http://www.perisoft.net/bushound/
3. **USB Protocol Analyzer** (macOS, via `PacketLogger` in Additional Tools for Xcode)
4. **Wireshark + usbmon** (Linux): `modprobe usbmon`, then capture from `usbmonN`.

### Option C: Saleae Logic 8 (Recommended — what we used)

A logic analyzer on the **programmer ↔ servo** wire is the highest-signal
capture path. The PC ↔ programmer link is HID and is best inspected from the
host; the programmer ↔ servo link is a half-duplex Dynamixel-v1-style serial
protocol at 9600 baud and is best inspected on the wire.

#### Hardware Setup

1. Connect the Saleae Logic 8 via USB.
2. Connect a probe to the servo signal wire:
   - **Channel 0**: signal line (the dongle and the servo share this — half-duplex)
   - **GND**: ground reference
3. The servo bus is half-duplex on a single wire, so one channel captures both directions.

#### Software Setup

```bash
# Install Logic 2 software from https://www.saleae.com/downloads/
# Then install the Python automation library if you want scripted captures:
pip install logic2-automation
```

#### Enable Automation API (optional, only for scripted dual-capture)

1. Open Logic 2.
2. Click the gear icon (Preferences) → Automation tab.
3. Toggle **Enable automation server** (port 10430).

#### Manual capture in Logic 2 (what we actually used)

1. Open Logic 2.
2. Set sample rate to 4 MS/s (>>> Nyquist for 9600 baud).
3. Add an "Async Serial" analyzer on Channel 0:
   - Bit rate: **9600**
   - Bits per Frame: **8**
   - Stop Bits: **1**
   - Parity: **No Parity Bit**
   - Significant Bit: **LSB first**
   - Signal Inversion: **Non Inverted**
4. Click capture, run the experiment, click stop.
5. **Export the analyzer table as CSV** (gear icon next to the Async Serial
   analyzer → Export Table → CSV). Save to
   `samples/saleae/<your_capture>.csv`.
6. Decode any saved CSV with `tools/decode_saleae_csv.py`, which reconstructs
   the FF FF | ID | LEN | INSTR/ERR | PARAMS | CHKSUM frames and validates
   the (bitwise NOT) checksums.

### Option D: Man-in-the-middle the HID API (alternative, not used)

Because the vendor software resolves `HidD_*` / `WriteFile` / `ReadFile`
through a normal DLL, a DLL-proxy or
[API Monitor](http://www.rohitab.com/apimonitor) hook on `WriteFile` and
`ReadFile` against the `AxonServoProgramming` process will log every TX/RX
buffer without needing to run a kernel capture driver. We didn't end up
using this because the Saleae approach was faster end-to-end, but it's a
viable alternative if you don't have a logic analyzer.

---

## Phase 3: Capture Protocol Traffic

### Test Scenarios to Capture

Perform each operation while capturing, with a clear pause between:

| # | Operation | Purpose |
|---|-----------|---------|
| 1 | Connect programmer (no servo) | Identify handshake/init |
| 2 | Connect servo | Detect servo detection protocol |
| 3 | Read all parameters | Capture read commands |
| 4 | Change one parameter (e.g., neutral position) | Capture write command |
| 5 | Write parameters to servo | Capture write/commit sequence |
| 6 | Move servo with slider | Capture position commands |
| 7 | Firmware update (if available) | Capture firmware protocol |

### Recording Notes

For each capture session, document:
- Timestamp
- Operation performed
- Result (success/failure)
- Any error messages from Axon software

---

## Phase 4: Protocol Analysis

### Step 4.1: Known packet structure (from static RE)

Every report observed is exactly **64 bytes** and has this layout:

```
byte 0  : 0x04                HID Report ID (constant)
byte 1  : <command>           opcode (0x8A = device identify, others TBD)
byte 2  : <arg0>              subcommand / parameter index
byte 3  : <arg1>              parameter value low
byte 4  : <arg2>              parameter value high (or a constant 0x04 in the identify cmd)
byte 5..: <payload>           variable — up to 59 bytes
byte 63 : zero-padding        unused bytes are zero
```

There is **no trailing checksum or CRC** in the HID report itself — USB already
provides the CRC at the bus level, so the application layer doesn't add one.

The ACK/response from the device begins `01 00 …` in bytes 1..2.

The following references are known from the static RE (`FINDINGS.md` §2):

| What | Address |
|---|---|
| TX scratch buffer (global, 64 B) | VA `0x7c52ac` |
| RX scratch buffer (global, 64 B) | VA `0x7c526c` |
| `jv1Arrival` identify handler | VA `0x40330c` |
| JVCL `WriteFile` wrapper | VA `0x4cd00c` |
| JVCL `ReadFile` wrapper | VA `0x4ccfcc` |

Use `tools/static_analyze.py find-xrefs …/…exe 7c52ac` to re-enumerate every
callsite that writes into the TX buffer — each site is a distinct command.

### Step 4.2: Identify Command Codes

Build a command table by observing patterns:

| Hex Code | Operation | Notes |
|----------|-----------|-------|
| 0x01 | ? | Seen when... |
| 0x02 | ? | Seen when... |
| ... | ... | ... |

### Step 4.3: Checksum Analysis

Not applicable at the host ↔ programmer layer. USB HID already provides CRC at
the bus level and the vendor software does not add an application-layer checksum.
A checksum may still exist between the programmer and the servo on the wire
side of the programmer; confirm with a logic-analyzer capture of that signal if
it ever becomes relevant.

### Step 4.4: Baud Rate Detection

Not applicable — this link has no baud rate. HID interrupt transfers happen on
the device's configured polling interval (`bInterval`), which you can read
from the interface descriptor once you have `HidP_GetCaps` output.

---

## Phase 5: Build Decode Tools

### Python Capture Analyzer

Create a script to parse captured data:

```python
#!/usr/bin/env python3
"""
Axon Protocol Analyzer
Parses USB capture data to identify protocol patterns
"""

import sys
from collections import defaultdict

class AxonPacketAnalyzer:
    def __init__(self):
        self.packets = []
        self.patterns = defaultdict(int)

    def load_hex_dump(self, filename):
        """Load hex dump from Wireshark export"""
        with open(filename, 'r') as f:
            for line in f:
                # Parse hex bytes
                bytes_data = bytes.fromhex(line.strip())
                self.packets.append(bytes_data)

    def find_headers(self):
        """Look for repeated byte patterns that might be headers"""
        for packet in self.packets:
            if len(packet) >= 2:
                header = packet[:2]
                self.patterns[header.hex()] += 1

        print("Potential headers (by frequency):")
        for pattern, count in sorted(self.patterns.items(),
                                      key=lambda x: -x[1]):
            print(f"  0x{pattern}: {count} occurrences")

    def analyze_lengths(self):
        """Analyze packet length distribution"""
        lengths = defaultdict(int)
        for packet in self.packets:
            lengths[len(packet)] += 1

        print("\nPacket length distribution:")
        for length, count in sorted(lengths.items()):
            print(f"  {length} bytes: {count} packets")

    def try_checksums(self, packet):
        """Test various checksum algorithms"""
        if len(packet) < 3:
            return

        data = packet[:-1]  # Assume last byte is checksum
        checksum = packet[-1]

        tests = {
            'sum': sum(data) & 0xFF,
            'xor': 0,
            'inv_sum': (~sum(data)) & 0xFF,
        }

        xor_val = 0
        for b in data:
            xor_val ^= b
        tests['xor'] = xor_val

        for name, calculated in tests.items():
            if calculated == checksum:
                print(f"  Checksum match: {name} = 0x{checksum:02X}")

if __name__ == '__main__':
    analyzer = AxonPacketAnalyzer()
    if len(sys.argv) > 1:
        analyzer.load_hex_dump(sys.argv[1])
        analyzer.find_headers()
        analyzer.analyze_lengths()
```

---

## Phase 6: Web HID Implementation

Once the command table is understood, the client implementation uses the
**Web HID API** (not Web Serial):

```javascript
// axon-protocol.js - Axon servo communication library (Web HID)
// Report layout (64 bytes, no application-layer checksum):
//   [0]    = reportId 0x04 (sent separately, not part of payload)
//   [0..58]= [cmd, arg0, arg1, arg2, ...payload]

const REPORT_ID = 0x04;
const REPORT_SIZE = 64;          // bytes (including the report ID byte)
const PAYLOAD_SIZE = REPORT_SIZE - 1;

// Fill in from Device Manager once you've identified the programmer:
const AXON_FILTERS = [
  // { vendorId: 0xXXXX, productId: 0xYYYY },
];

// Known opcodes so far (extend as you reverse-engineer more):
const CMD = Object.freeze({
  IDENTIFY: 0x8A,   // jv1Arrival uses 04 8A 00 00 04 ... (0x8A is the only one
                    // confirmed so far; remaining opcodes come from walking
                    // the 21 callsites listed in docs/FINDINGS.md §2.2)
});

class AxonServo {
  constructor() {
    this.device = null;
    this._pending = null;
  }

  async connect() {
    const [device] = await navigator.hid.requestDevice({ filters: AXON_FILTERS });
    if (!device) throw new Error("No device selected");
    if (!device.opened) await device.open();
    this.device = device;
    device.addEventListener("inputreport", (e) => this._onReport(e));
  }

  _onReport(event) {
    // event.data is a DataView of PAYLOAD_SIZE bytes (the reportId is
    // available as event.reportId).
    if (this._pending) {
      const pending = this._pending;
      this._pending = null;
      pending.resolve({
        reportId: event.reportId,
        bytes: new Uint8Array(event.data.buffer, event.data.byteOffset,
                              event.data.byteLength),
      });
    }
  }

  buildPayload(cmd, ...args) {
    const buf = new Uint8Array(PAYLOAD_SIZE); // already zero-filled
    buf[0] = cmd;
    for (let i = 0; i < args.length && i + 1 < PAYLOAD_SIZE; i++) {
      buf[i + 1] = args[i] & 0xff;
    }
    return buf;
  }

  async sendCommand(cmd, ...args) {
    if (!this.device) throw new Error("Not connected");
    const payload = this.buildPayload(cmd, ...args);
    const wait = new Promise((resolve, reject) => {
      this._pending = { resolve, reject };
      setTimeout(() => {
        if (this._pending) {
          this._pending = null;
          reject(new Error("HID read timeout"));
        }
      }, 1000);
    });
    await this.device.sendReport(REPORT_ID, payload);
    return wait;
  }

  async identify() {
    // The vendor software sends: 04 8A 00 00 04 00 ... — arg2 (byte[4]) = 0x04
    const rsp = await this.sendCommand(CMD.IDENTIFY, 0x00, 0x00, 0x04);
    const b = rsp.bytes;
    return {
      ack: b[0] === 0x01 && b[1] === 0x00,        // rx[1] and rx[2] in the
      model: b[4],                                // vendor-layout numbering
      mode: b[6],
      name: new TextDecoder().decode(b.slice(7, 15)).replace(/\*/g, " ").trim(),
      raw: Array.from(b),
    };
  }

  async disconnect() {
    if (this.device && this.device.opened) await this.device.close();
    this.device = null;
  }
}

export { AxonServo, CMD, REPORT_ID, REPORT_SIZE };
```

Stub — the opcodes beyond `IDENTIFY` still have to be filled in from either
API-Monitor logs of the vendor software or a USBPcap capture.

---

## Appendix A: Wireshark USB Filter Reference

```wireshark
# Show only URB_BULK (data transfers)
usb.transfer_type == 0x03

# Show control transfers (setup/config)
usb.transfer_type == 0x02

# Filter by endpoint direction
usb.endpoint_address.direction == 1  # IN (device to host)
usb.endpoint_address.direction == 0  # OUT (host to device)

# Show packets with data
usb.data_len > 0

# Follow USB stream
usb.device_address == X
```

## Appendix B: Common Servo Protocol Commands

Reference commands from similar protocols:

| Command | Dynamixel | LewanSoul | Hitec |
|---------|-----------|-----------|-------|
| Ping | 0x01 | 0x02 | N/A |
| Read | 0x02 | 0x03 | Custom |
| Write | 0x03 | 0x01 | Custom |
| Sync Write | 0x83 | N/A | N/A |
| Move | N/A | 0x01 | N/A |

## Appendix C: Resources

- [USBPcap Download](https://desowin.org/usbpcap/)
- [Wireshark USB Wiki](https://wiki.wireshark.org/CaptureSetup/USB)
- [Chrome Web Serial API](https://developer.chrome.com/docs/capabilities/serial)
- [HitecDServo (reverse engineered)](https://github.com/timmaxw/HitecDServo)
- [LewanSoul Protocol PDF](https://github.com/madhephaestus/lx16a-servo/blob/master/lx-16a%20LewanSoul%20Bus%20Servo%20Communication%20Protocol.pdf)

---

## Next Steps

Static reverse engineering of the vendor software is in `docs/FINDINGS.md`.
Remaining work, in priority order:

1. [x] Determine transport: **HID** (not a virtual COM port). See FINDINGS §2.
2. [x] Confirm the report layout: **64-byte report, Report ID 0x04**.
3. [ ] Identify the Programmer MK2 **VID/PID** from Windows Device Manager (or
       `hidapi` on macOS/Linux) with the real device plugged in.
4. [ ] Extract the **hardcoded AES key** from the binary (find the
       `AESDecFile` callsite reachable from the `Update firmware` button —
       one path is `Error 1030` string xref at VA `0x4070fc`, walk up). Once
       the key is known, `tools/static_analyze.py try-decrypt` will verify.
5. [ ] Decrypt one `.sfw` file and confirm whether the plaintext at offset
       `0x10` is a readable header (magic + length + CRC + device id).
6. [ ] Enumerate every command opcode by disassembling each of the 21 HID
       callsites listed in FINDINGS §2.2. Dump the TX buffer bytes that each
       site sets, build a `(cmd, args, description)` table.
7. [ ] Run USBPcap (or API Monitor) on the vendor GUI performing each UI
       action once, and cross-check the captured bytes against the command
       table from the previous step.
8. [ ] Build the JavaScript client on **Web HID** (sketch in Phase 6 above).
9. [ ] Create the web UI.
