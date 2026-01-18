#!/usr/bin/env python3
"""
Serial Monitor for Axon Programmer

Interactive serial monitor for testing communication with the Axon Programmer MK2.
Can send raw hex commands and display responses.

Usage:
    python serial_monitor.py              # Auto-detect port
    python serial_monitor.py COM3         # Specify port
    python serial_monitor.py /dev/ttyUSB0 --baud 115200
"""

import sys
import time
import argparse
import threading
from typing import Optional

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("Error: pyserial not installed. Run: pip install pyserial")
    sys.exit(1)


class SerialMonitor:
    """Interactive serial monitor with hex support"""

    COMMON_BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 250000, 500000, 1000000]

    def __init__(self, port: str, baudrate: int = 115200):
        self.port = port
        self.baudrate = baudrate
        self.serial: Optional[serial.Serial] = None
        self.running = False
        self.rx_thread: Optional[threading.Thread] = None
        self.log_file: Optional[str] = None
        self.log_handle = None

    def connect(self) -> bool:
        """Connect to serial port"""
        try:
            self.serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=0.1,
            )
            print(f"Connected to {self.port} at {self.baudrate} baud")
            return True
        except serial.SerialException as e:
            print(f"Error: Could not open {self.port}: {e}")
            return False

    def disconnect(self):
        """Disconnect from serial port"""
        self.running = False
        if self.rx_thread:
            self.rx_thread.join(timeout=1)
        if self.serial:
            self.serial.close()
            self.serial = None
        if self.log_handle:
            self.log_handle.close()
            self.log_handle = None
        print("Disconnected")

    def start_logging(self, filename: str):
        """Start logging to file"""
        self.log_file = filename
        self.log_handle = open(filename, 'w')
        print(f"Logging to {filename}")

    def log(self, direction: str, data: bytes):
        """Log data to file"""
        if self.log_handle:
            timestamp = time.time()
            hex_str = data.hex()
            self.log_handle.write(f"{timestamp:.3f} {direction}: {hex_str}\n")
            self.log_handle.flush()

    def rx_loop(self):
        """Background thread to receive and display data"""
        while self.running and self.serial:
            try:
                if self.serial.in_waiting:
                    data = self.serial.read(self.serial.in_waiting)
                    if data:
                        self.log('RX', data)
                        self.display_rx(data)
                else:
                    time.sleep(0.01)
            except serial.SerialException:
                break

    def display_rx(self, data: bytes):
        """Display received data"""
        hex_str = ' '.join(f'{b:02X}' for b in data)
        ascii_str = ''.join(chr(b) if 32 <= b < 127 else '.' for b in data)
        print(f"\n← RX [{len(data):3d}]: {hex_str}")
        print(f"         ASCII: {ascii_str}")
        print("> ", end='', flush=True)

    def send_hex(self, hex_str: str) -> bool:
        """Send hex data"""
        try:
            # Clean up input
            hex_str = hex_str.replace(' ', '').replace('-', '').replace(':', '')
            hex_str = hex_str.replace('0x', '').replace('0X', '')

            data = bytes.fromhex(hex_str)
            self.serial.write(data)
            self.log('TX', data)

            hex_display = ' '.join(f'{b:02X}' for b in data)
            print(f"→ TX [{len(data):3d}]: {hex_display}")
            return True
        except ValueError as e:
            print(f"Error: Invalid hex string: {e}")
            return False

    def send_raw(self, text: str):
        """Send raw text"""
        data = text.encode('utf-8')
        self.serial.write(data)
        self.log('TX', data)
        print(f"→ TX [{len(data):3d}]: {text!r}")

    def try_baud_rates(self):
        """Try different baud rates and look for valid responses"""
        print("Testing baud rates...")

        # Simple ping packet patterns to try
        test_packets = [
            bytes([0x55, 0x55, 0x01, 0x01, 0x00]),  # LewanSoul-style ping
            bytes([0xFF, 0xFF, 0x01, 0x02, 0x01, 0xFB]),  # Dynamixel ping
            bytes([0xAA, 0x55, 0x00, 0x00]),  # Generic sync
        ]

        original_baud = self.baudrate

        for baud in self.COMMON_BAUDS:
            print(f"  Trying {baud} baud...", end=' ')
            self.serial.baudrate = baud
            self.serial.reset_input_buffer()

            for packet in test_packets:
                self.serial.write(packet)
                time.sleep(0.1)

                if self.serial.in_waiting:
                    response = self.serial.read(self.serial.in_waiting)
                    print(f"RESPONSE: {response.hex()}")
                    print(f"  → Found response at {baud} baud!")
                    return baud

            print("no response")

        print(f"  No responses found, reverting to {original_baud} baud")
        self.serial.baudrate = original_baud
        return None

    def run_interactive(self):
        """Run interactive mode"""
        self.running = True
        self.rx_thread = threading.Thread(target=self.rx_loop, daemon=True)
        self.rx_thread.start()

        print("\nInteractive mode. Commands:")
        print("  <hex>     Send hex bytes (e.g., '55 55 01 02 03')")
        print("  !<text>   Send raw text")
        print("  /baud <n> Change baud rate")
        print("  /scan     Try different baud rates")
        print("  /log <f>  Start logging to file")
        print("  /quit     Exit")
        print("")

        try:
            while self.running:
                try:
                    line = input("> ").strip()
                except EOFError:
                    break

                if not line:
                    continue

                if line.startswith('/'):
                    # Command
                    parts = line[1:].split(maxsplit=1)
                    cmd = parts[0].lower()
                    arg = parts[1] if len(parts) > 1 else ''

                    if cmd == 'quit' or cmd == 'exit':
                        break
                    elif cmd == 'baud':
                        try:
                            new_baud = int(arg)
                            self.serial.baudrate = new_baud
                            self.baudrate = new_baud
                            print(f"Baud rate set to {new_baud}")
                        except ValueError:
                            print(f"Current baud: {self.baudrate}")
                    elif cmd == 'scan':
                        self.try_baud_rates()
                    elif cmd == 'log':
                        if arg:
                            self.start_logging(arg)
                        else:
                            self.start_logging(f'capture_{int(time.time())}.log')
                    else:
                        print(f"Unknown command: {cmd}")

                elif line.startswith('!'):
                    # Raw text
                    self.send_raw(line[1:])
                else:
                    # Hex data
                    self.send_hex(line)

        except KeyboardInterrupt:
            print("\nInterrupted")

        self.disconnect()


def list_ports():
    """List available serial ports"""
    ports = serial.tools.list_ports.comports()
    if not ports:
        print("No serial ports found")
        return []

    print("Available serial ports:")
    for port in ports:
        print(f"  {port.device}")
        print(f"    Description: {port.description}")
        print(f"    VID:PID: {port.vid:04X}:{port.pid:04X}" if port.vid else "    VID:PID: N/A")
        print(f"    Serial: {port.serial_number or 'N/A'}")
        print()

    return [p.device for p in ports]


def find_axon_port() -> Optional[str]:
    """Try to find the Axon programmer port"""
    ports = serial.tools.list_ports.comports()

    # Known USB-serial chip VIDs
    known_vids = {
        0x1A86: 'CH340',
        0x10C4: 'CP210x',
        0x0403: 'FTDI',
        0x067B: 'Prolific',
    }

    candidates = []
    for port in ports:
        if port.vid in known_vids:
            candidates.append((port.device, known_vids[port.vid]))
        elif 'serial' in port.description.lower():
            candidates.append((port.device, 'Unknown serial'))

    if len(candidates) == 1:
        print(f"Found likely port: {candidates[0][0]} ({candidates[0][1]})")
        return candidates[0][0]
    elif len(candidates) > 1:
        print("Multiple serial ports found:")
        for i, (device, chip) in enumerate(candidates):
            print(f"  {i+1}. {device} ({chip})")
        return candidates[0][0]  # Return first candidate

    return None


def main():
    parser = argparse.ArgumentParser(description='Serial monitor for Axon Programmer')
    parser.add_argument('port', nargs='?', help='Serial port (e.g., COM3 or /dev/ttyUSB0)')
    parser.add_argument('--baud', '-b', type=int, default=115200, help='Baud rate')
    parser.add_argument('--list', '-l', action='store_true', help='List available ports')
    parser.add_argument('--log', help='Log file')

    args = parser.parse_args()

    if args.list:
        list_ports()
        return

    port = args.port
    if not port:
        port = find_axon_port()
        if not port:
            print("No port specified and could not auto-detect.")
            print("Use --list to see available ports")
            return

    monitor = SerialMonitor(port, args.baud)

    if not monitor.connect():
        return

    if args.log:
        monitor.start_logging(args.log)

    monitor.run_interactive()


if __name__ == '__main__':
    main()
