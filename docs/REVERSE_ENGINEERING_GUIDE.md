# Axon Servo Programmer Reverse Engineering Guide

This guide walks through capturing and analyzing USB traffic from the Axon Programmer MK2 to reverse engineer the serial protocol.

## Overview

The Axon Programmer MK2 connects via USB-C and communicates with MK2 series servos. Based on similar devices, it likely:
- Contains a USB-to-Serial bridge chip (CH340, CP2102, or similar)
- Appears as a virtual COM port to Windows
- Uses half-duplex UART communication over the servo signal wire

Our goal: Capture the serial traffic, decode the protocol, and replicate it in a web app.

---

## Phase 1: Hardware Identification

### Step 1.1: Identify the USB Chip

Before capturing traffic, let's identify what chip the Programmer MK2 uses.

**On Windows:**
1. Plug in the Axon Programmer MK2
2. Open Device Manager (Win+X → Device Manager)
3. Expand "Ports (COM & LPT)"
4. Find the new COM port entry
5. Right-click → Properties → Details → Hardware Ids

**Look for these patterns:**
```
VID_1A86 = WCH (CH340/CH341)
VID_10C4 = Silicon Labs (CP2102/CP2104)
VID_0403 = FTDI (FT232)
VID_067B = Prolific (PL2303)
```

**Record these values:**
- Vendor ID (VID): ____________
- Product ID (PID): ____________
- COM Port: ____________
- Driver name: ____________

### Step 1.2: Check Driver Details

Also note:
- Baud rate settings available in port properties
- Any special driver (Axon-specific vs generic USB-serial)

---

## Phase 2: USB Traffic Capture Setup

### Option A: Wireshark + USBPcap (Recommended)

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

#### Filter for Your Device

Once capturing, use these display filters:

```wireshark
# Filter by device address (find this in initial enumeration)
usb.device_address == X

# Filter for bulk transfers (actual serial data)
usb.transfer_type == 0x03

# Exclude empty packets
usb.data_len > 0

# Combined filter
usb.device_address == X && usb.transfer_type == 0x03 && usb.data_len > 0
```

### Option B: Serial Port Monitor (Alternative)

If USBPcap is problematic, use a dedicated serial monitor:

1. **Free Serial Port Monitor** (HHD Software): https://freeserialanalyzer.com/
2. **Serial Port Monitor** (Eltima): https://www.eltima.com/products/serial-port-monitor/

These intercept COM port traffic directly.

### Option C: Logic Analyzer (Hardware)

For direct signal capture:

1. Use a Saleae Logic or similar ($10-400 depending on speed)
2. Connect to the servo signal wire
3. Configure async serial decoder
4. Capture during programming operations

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

### Step 4.1: Identify Packet Structure

Look for patterns in the captured data:

**Common Serial Protocol Patterns:**

```
Header bytes:    0x55 0x55  or  0xFF 0xFF  or  0xAA 0x55
ID byte:         Device/servo identifier
Length byte:     Payload length
Command byte:    Operation code
Parameters:      Variable data
Checksum:        Sum, XOR, or CRC
```

**Example packet structures from similar servos:**

```
LewanSoul:  [0x55] [0x55] [ID] [LEN] [CMD] [PARAMS...] [CHECKSUM]
Dynamixel:  [0xFF] [0xFF] [ID] [LEN] [INST] [PARAMS...] [CHECKSUM]
Hitec:      Custom bit-banged protocol at 152000 baud
```

### Step 4.2: Identify Command Codes

Build a command table by observing patterns:

| Hex Code | Operation | Notes |
|----------|-----------|-------|
| 0x01 | ? | Seen when... |
| 0x02 | ? | Seen when... |
| ... | ... | ... |

### Step 4.3: Checksum Analysis

Test common checksum algorithms:

```python
def checksum_sum(data):
    """Simple sum (truncated to 8 bits)"""
    return sum(data) & 0xFF

def checksum_xor(data):
    """XOR all bytes"""
    result = 0
    for b in data:
        result ^= b
    return result

def checksum_invert_sum(data):
    """Inverted sum (Dynamixel style)"""
    return (~sum(data)) & 0xFF

def checksum_crc8(data):
    """CRC-8 (various polynomials)"""
    # Implementation depends on polynomial
    pass
```

### Step 4.4: Baud Rate Detection

Common baud rates for servo protocols:
- 9600 (legacy)
- 38400
- 57600
- 115200 (most common)
- 250000
- 500000
- 1000000 (1Mbps)

The Axon software may negotiate or auto-detect baud rate.

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

## Phase 6: Web Serial Implementation

Once protocol is understood, implement in JavaScript:

```javascript
// axon-protocol.js - Axon servo communication library

class AxonServo {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
  }

  async connect() {
    // Request serial port
    this.port = await navigator.serial.requestPort({
      // Add filters once VID/PID are known
      // filters: [{ usbVendorId: 0x1234, usbProductId: 0x5678 }]
    });

    // Open with detected baud rate
    await this.port.open({
      baudRate: 115200,  // Adjust based on capture analysis
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none'
    });

    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
  }

  buildPacket(command, params = []) {
    // Build packet based on reverse-engineered format
    // This is a placeholder - update after protocol analysis
    const packet = [
      0x55, 0x55,           // Header (placeholder)
      0x01,                 // ID
      params.length + 2,    // Length
      command,              // Command
      ...params,            // Parameters
    ];

    // Add checksum
    const checksum = this.calculateChecksum(packet.slice(2));
    packet.push(checksum);

    return new Uint8Array(packet);
  }

  calculateChecksum(data) {
    // Implement based on analysis
    return (~data.reduce((a, b) => a + b, 0)) & 0xFF;
  }

  async sendCommand(command, params = []) {
    const packet = this.buildPacket(command, params);
    await this.writer.write(packet);

    // Read response
    const { value } = await this.reader.read();
    return this.parseResponse(value);
  }

  parseResponse(data) {
    // Parse based on reverse-engineered format
    return {
      raw: Array.from(data),
      // Add parsed fields
    };
  }

  async readParameters() {
    // Implement read command
    return await this.sendCommand(0x02);  // Placeholder command
  }

  async writeParameter(param, value) {
    // Implement write command
    return await this.sendCommand(0x03, [param, value]);  // Placeholder
  }

  async setPosition(position) {
    // Implement position command
    const posLow = position & 0xFF;
    const posHigh = (position >> 8) & 0xFF;
    return await this.sendCommand(0x04, [posLow, posHigh]);  // Placeholder
  }

  async disconnect() {
    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
    }
    if (this.writer) {
      await this.writer.close();
    }
    if (this.port) {
      await this.port.close();
    }
  }
}

export { AxonServo };
```

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

1. [ ] Identify Axon Programmer MK2 USB chip (VID/PID)
2. [ ] Install USBPcap and Wireshark
3. [ ] Capture init/connect sequence
4. [ ] Capture parameter read/write
5. [ ] Document packet structure
6. [ ] Identify checksum algorithm
7. [ ] Build JavaScript implementation
8. [ ] Create web UI
