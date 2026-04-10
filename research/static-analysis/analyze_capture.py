#!/usr/bin/env python3
"""
Axon Protocol Analyzer

Analyzes USB/serial capture data to reverse engineer the Axon servo protocol.

Usage:
    python analyze_capture.py <capture_file>
    python analyze_capture.py --wireshark <pcap_file>
    python analyze_capture.py --hex <hex_dump_file>

Supports:
    - Raw hex dumps (one packet per line)
    - Wireshark JSON exports
    - Wireshark pcap files (requires pyshark)
"""

import sys
import json
import argparse
from collections import defaultdict
from dataclasses import dataclass
from typing import List, Optional, Tuple
import struct


@dataclass
class Packet:
    """Represents a captured packet"""
    timestamp: float
    direction: str  # 'TX' (to servo) or 'RX' (from servo)
    data: bytes
    annotation: str = ""


class ProtocolAnalyzer:
    """Analyzes captured packets to identify protocol patterns"""

    COMMON_HEADERS = [
        (b'\x55\x55', 'LewanSoul-style'),
        (b'\xff\xff', 'Dynamixel-style'),
        (b'\xaa\x55', 'Generic sync'),
        (b'\x55\xaa', 'Generic sync (inverted)'),
        (b'\xfa\xaf', 'Custom sync'),
    ]

    def __init__(self):
        self.packets: List[Packet] = []
        self.tx_packets: List[Packet] = []
        self.rx_packets: List[Packet] = []

    def load_hex_file(self, filename: str, direction: str = 'TX'):
        """Load hex dump file (one packet per line)"""
        with open(filename, 'r') as f:
            timestamp = 0.0
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue

                # Handle direction markers
                if line.startswith('TX:') or line.startswith('>'):
                    direction = 'TX'
                    line = line.split(':', 1)[-1].strip()
                    line = line.lstrip('> ').strip()
                elif line.startswith('RX:') or line.startswith('<'):
                    direction = 'RX'
                    line = line.split(':', 1)[-1].strip()
                    line = line.lstrip('< ').strip()

                # Remove common separators
                line = line.replace(' ', '').replace('-', '').replace(':', '')

                try:
                    data = bytes.fromhex(line)
                    if data:
                        packet = Packet(timestamp, direction, data)
                        self.packets.append(packet)
                        if direction == 'TX':
                            self.tx_packets.append(packet)
                        else:
                            self.rx_packets.append(packet)
                        timestamp += 0.001
                except ValueError:
                    print(f"Warning: Could not parse line: {line[:50]}...")

    def load_wireshark_json(self, filename: str):
        """Load Wireshark JSON export"""
        with open(filename, 'r') as f:
            data = json.load(f)

        for packet_data in data:
            try:
                layers = packet_data.get('_source', {}).get('layers', {})
                usb_layer = layers.get('usb', {})
                data_layer = layers.get('usb.capdata', '')

                if not data_layer:
                    continue

                # Parse timestamp
                frame = layers.get('frame', {})
                timestamp = float(frame.get('frame.time_relative', 0))

                # Determine direction from endpoint
                endpoint = usb_layer.get('usb.endpoint_address', '0')
                direction = 'RX' if int(endpoint, 16) & 0x80 else 'TX'

                # Parse data
                hex_data = data_layer.replace(':', '')
                raw_data = bytes.fromhex(hex_data)

                packet = Packet(timestamp, direction, raw_data)
                self.packets.append(packet)
                if direction == 'TX':
                    self.tx_packets.append(packet)
                else:
                    self.rx_packets.append(packet)

            except (KeyError, ValueError) as e:
                continue

    def analyze_headers(self) -> dict:
        """Find potential packet headers"""
        results = {
            'known_headers': [],
            'candidate_headers': defaultdict(int),
            'first_bytes': defaultdict(int),
        }

        for packet in self.packets:
            if len(packet.data) < 2:
                continue

            # Check known headers
            for header, name in self.COMMON_HEADERS:
                if packet.data.startswith(header):
                    results['known_headers'].append((name, packet))

            # Track 2-byte sequences
            header = packet.data[:2]
            results['candidate_headers'][header.hex()] += 1

            # Track first byte
            results['first_bytes'][f'0x{packet.data[0]:02X}'] += 1

        return results

    def analyze_lengths(self) -> dict:
        """Analyze packet length patterns"""
        results = {
            'tx_lengths': defaultdict(int),
            'rx_lengths': defaultdict(int),
            'all_lengths': defaultdict(int),
        }

        for packet in self.tx_packets:
            results['tx_lengths'][len(packet.data)] += 1
            results['all_lengths'][len(packet.data)] += 1

        for packet in self.rx_packets:
            results['rx_lengths'][len(packet.data)] += 1
            results['all_lengths'][len(packet.data)] += 1

        return results

    def analyze_checksums(self) -> List[dict]:
        """Test various checksum algorithms on packets"""
        results = []

        for packet in self.packets:
            if len(packet.data) < 3:
                continue

            data = packet.data[:-1]
            last_byte = packet.data[-1]

            matches = []

            # Test checksum algorithms
            algorithms = {
                'sum_mod256': sum(data) & 0xFF,
                'sum_inverted': (~sum(data)) & 0xFF,
                'xor_all': self._xor_bytes(data),
                'sum_skip_header2': sum(data[2:]) & 0xFF if len(data) > 2 else None,
                'inv_sum_skip2': (~sum(data[2:])) & 0xFF if len(data) > 2 else None,
            }

            for name, calculated in algorithms.items():
                if calculated is not None and calculated == last_byte:
                    matches.append(name)

            if matches:
                results.append({
                    'packet': packet.data.hex(),
                    'checksum_byte': f'0x{last_byte:02X}',
                    'matches': matches,
                })

        return results

    def _xor_bytes(self, data: bytes) -> int:
        """XOR all bytes together"""
        result = 0
        for b in data:
            result ^= b
        return result

    def find_command_patterns(self) -> dict:
        """Look for command/response patterns"""
        results = {
            'potential_commands': defaultdict(list),
            'tx_rx_pairs': [],
        }

        # Group TX packets by potential command byte
        for packet in self.tx_packets:
            if len(packet.data) >= 4:
                # Try different positions for command byte
                for pos in [2, 3, 4]:
                    if pos < len(packet.data):
                        cmd = packet.data[pos]
                        results['potential_commands'][f'pos{pos}_0x{cmd:02X}'].append(
                            packet.data.hex()
                        )

        # Try to pair TX/RX
        for i, tx in enumerate(self.tx_packets):
            # Find next RX after this TX
            for rx in self.rx_packets:
                if rx.timestamp > tx.timestamp:
                    results['tx_rx_pairs'].append({
                        'tx': tx.data.hex(),
                        'rx': rx.data.hex(),
                        'delta_ms': (rx.timestamp - tx.timestamp) * 1000,
                    })
                    break

        return results

    def detect_baud_rate(self) -> Optional[int]:
        """Try to detect baud rate from timing (if available)"""
        # This would need timing info from the capture
        # For now, return common rates to try
        return None

    def generate_report(self) -> str:
        """Generate analysis report"""
        lines = []
        lines.append("=" * 60)
        lines.append("AXON PROTOCOL ANALYSIS REPORT")
        lines.append("=" * 60)
        lines.append("")

        # Summary
        lines.append(f"Total packets: {len(self.packets)}")
        lines.append(f"  TX (to servo): {len(self.tx_packets)}")
        lines.append(f"  RX (from servo): {len(self.rx_packets)}")
        lines.append("")

        # Header analysis
        lines.append("-" * 40)
        lines.append("HEADER ANALYSIS")
        lines.append("-" * 40)
        header_results = self.analyze_headers()

        if header_results['known_headers']:
            lines.append("Known headers found:")
            for name, packet in header_results['known_headers'][:5]:
                lines.append(f"  {name}: {packet.data.hex()}")
        lines.append("")

        lines.append("Candidate headers (by frequency):")
        sorted_headers = sorted(
            header_results['candidate_headers'].items(),
            key=lambda x: -x[1]
        )
        for header, count in sorted_headers[:10]:
            lines.append(f"  0x{header}: {count} occurrences")
        lines.append("")

        # Length analysis
        lines.append("-" * 40)
        lines.append("LENGTH ANALYSIS")
        lines.append("-" * 40)
        length_results = self.analyze_lengths()

        lines.append("TX packet lengths:")
        for length, count in sorted(length_results['tx_lengths'].items()):
            lines.append(f"  {length} bytes: {count} packets")

        lines.append("RX packet lengths:")
        for length, count in sorted(length_results['rx_lengths'].items()):
            lines.append(f"  {length} bytes: {count} packets")
        lines.append("")

        # Checksum analysis
        lines.append("-" * 40)
        lines.append("CHECKSUM ANALYSIS")
        lines.append("-" * 40)
        checksum_results = self.analyze_checksums()

        if checksum_results:
            # Count algorithm matches
            algo_counts = defaultdict(int)
            for result in checksum_results:
                for algo in result['matches']:
                    algo_counts[algo] += 1

            lines.append("Checksum algorithm matches:")
            for algo, count in sorted(algo_counts.items(), key=lambda x: -x[1]):
                lines.append(f"  {algo}: {count} packets")
            lines.append("")

            lines.append("Sample matches:")
            for result in checksum_results[:5]:
                lines.append(f"  {result['packet']}")
                lines.append(f"    checksum=0x{result['checksum_byte']}, "
                           f"algorithms={result['matches']}")
        else:
            lines.append("No checksum patterns detected")
        lines.append("")

        # Command patterns
        lines.append("-" * 40)
        lines.append("COMMAND PATTERN ANALYSIS")
        lines.append("-" * 40)
        cmd_results = self.find_command_patterns()

        lines.append("Potential command bytes (position, value, count):")
        cmd_summary = []
        for key, packets in cmd_results['potential_commands'].items():
            cmd_summary.append((key, len(packets)))
        cmd_summary.sort(key=lambda x: -x[1])

        for cmd, count in cmd_summary[:15]:
            if count > 1:
                lines.append(f"  {cmd}: {count} occurrences")
        lines.append("")

        # TX/RX pairs
        if cmd_results['tx_rx_pairs']:
            lines.append("Sample TX/RX pairs:")
            for pair in cmd_results['tx_rx_pairs'][:5]:
                lines.append(f"  TX: {pair['tx']}")
                lines.append(f"  RX: {pair['rx']}")
                lines.append(f"  Response time: {pair['delta_ms']:.2f} ms")
                lines.append("")

        # Raw packet dump
        lines.append("-" * 40)
        lines.append("PACKET DUMP (first 20)")
        lines.append("-" * 40)
        for i, packet in enumerate(self.packets[:20]):
            direction = "→" if packet.direction == 'TX' else "←"
            lines.append(f"{i:3d} {direction} {packet.data.hex()}")

        return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='Analyze USB/serial captures to reverse engineer servo protocols'
    )
    parser.add_argument('file', help='Capture file to analyze')
    parser.add_argument('--format', choices=['hex', 'json', 'auto'],
                       default='auto', help='Input file format')
    parser.add_argument('--output', '-o', help='Output report file')

    args = parser.parse_args()

    analyzer = ProtocolAnalyzer()

    # Detect format
    if args.format == 'auto':
        if args.file.endswith('.json'):
            args.format = 'json'
        else:
            args.format = 'hex'

    # Load data
    print(f"Loading {args.file}...")
    if args.format == 'json':
        analyzer.load_wireshark_json(args.file)
    else:
        analyzer.load_hex_file(args.file)

    print(f"Loaded {len(analyzer.packets)} packets")

    # Generate report
    report = analyzer.generate_report()

    if args.output:
        with open(args.output, 'w') as f:
            f.write(report)
        print(f"Report written to {args.output}")
    else:
        print(report)


if __name__ == '__main__':
    main()
