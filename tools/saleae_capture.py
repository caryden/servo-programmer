#!/usr/bin/env python3
"""
Saleae Logic 8 Capture Tool for Axon Servo Protocol Analysis

Automates capture and UART decoding using Saleae Logic 2's Automation API.

Requirements:
    pip install logic2-automation

Setup:
    1. Open Logic 2 software
    2. Go to Preferences (gear icon) → Enable "Enable automation server"
    3. Default port is 10430

Usage:
    python saleae_capture.py                    # Interactive capture
    python saleae_capture.py --duration 5       # Timed capture (5 seconds)
    python saleae_capture.py --trigger          # Wait for signal trigger
    python saleae_capture.py --baud 115200      # Specify baud rate
    python saleae_capture.py --continuous       # Continuous capture mode
"""

import argparse
import sys
import os
import time
from datetime import datetime
from pathlib import Path

try:
    from saleae import automation
    from saleae.automation import (
        Manager,
        LogicDeviceConfiguration,
        CaptureConfiguration,
        TimedCaptureMode,
        ManualCaptureMode,
        DigitalTriggerCaptureMode,
        DigitalTriggerType,
        RadixType,
    )
except ImportError:
    print("Error: Saleae automation library not installed.")
    print("Install with: pip install logic2-automation")
    print("\nAlso ensure Logic 2 software is running with automation enabled:")
    print("  Preferences → Enable 'Enable automation server'")
    sys.exit(1)


# Default configuration for Axon servo protocol analysis
DEFAULT_CONFIG = {
    'sample_rate': 10_000_000,  # 10 MS/s (plenty for serial up to 1Mbps)
    'voltage_threshold': 3.3,   # 3.3V logic level
    'tx_channel': 0,            # Channel for TX (programmer → servo)
    'rx_channel': 1,            # Channel for RX (servo → programmer)
    'baud_rate': 115200,        # Common default, adjust as needed
    'automation_port': 10430,   # Logic 2 default port
}

# Common baud rates to try during auto-detection
COMMON_BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 250000, 500000, 1000000]


class SaleaeCapture:
    """Manages Saleae Logic 8 captures for servo protocol analysis."""

    def __init__(self, port: int = DEFAULT_CONFIG['automation_port']):
        self.port = port
        self.manager = None
        self.device_id = None

    def connect(self) -> bool:
        """Connect to Logic 2 automation server."""
        try:
            self.manager = Manager.connect(port=self.port)
            print(f"Connected to Logic 2 on port {self.port}")

            # List connected devices
            devices = self.manager.get_devices()
            if not devices:
                print("No Saleae devices found. Connect your Logic 8 and try again.")
                return False

            for device in devices:
                print(f"  Found: {device.device_type} (ID: {device.device_id})")
                self.device_id = device.device_id

            return True

        except Exception as e:
            print(f"Error connecting to Logic 2: {e}")
            print("\nTroubleshooting:")
            print("  1. Ensure Logic 2 is running")
            print("  2. Enable automation: Preferences → 'Enable automation server'")
            print("  3. Check port (default: 10430)")
            return False

    def disconnect(self):
        """Disconnect from Logic 2."""
        if self.manager:
            self.manager.close()
            self.manager = None

    def capture_timed(
        self,
        duration_seconds: float = 5.0,
        sample_rate: int = DEFAULT_CONFIG['sample_rate'],
        voltage_threshold: float = DEFAULT_CONFIG['voltage_threshold'],
        channels: list = None
    ):
        """
        Capture data for a fixed duration.

        Args:
            duration_seconds: How long to capture
            sample_rate: Digital sample rate in Hz
            voltage_threshold: Logic level voltage
            channels: List of channels to enable (default: [0, 1])

        Returns:
            Capture object or None on failure
        """
        if channels is None:
            channels = [DEFAULT_CONFIG['tx_channel'], DEFAULT_CONFIG['rx_channel']]

        device_config = LogicDeviceConfiguration(
            enabled_digital_channels=channels,
            digital_sample_rate=sample_rate,
            digital_threshold_volts=voltage_threshold,
        )

        capture_config = CaptureConfiguration(
            capture_mode=TimedCaptureMode(duration_seconds=duration_seconds)
        )

        print(f"Starting timed capture ({duration_seconds}s)...")
        print(f"  Channels: {channels}")
        print(f"  Sample rate: {sample_rate/1e6:.1f} MS/s")
        print(f"  Voltage threshold: {voltage_threshold}V")

        try:
            capture = self.manager.start_capture(
                device_id=self.device_id,
                device_configuration=device_config,
                capture_configuration=capture_config
            )
            capture.wait()
            print("Capture complete.")
            return capture

        except Exception as e:
            print(f"Capture error: {e}")
            return None

    def capture_triggered(
        self,
        trigger_channel: int = 0,
        trigger_type: str = 'falling',
        duration_after_trigger: float = 1.0,
        sample_rate: int = DEFAULT_CONFIG['sample_rate'],
        voltage_threshold: float = DEFAULT_CONFIG['voltage_threshold'],
        channels: list = None
    ):
        """
        Capture data triggered by a signal edge.

        Args:
            trigger_channel: Channel to trigger on
            trigger_type: 'rising', 'falling', 'pulse_high', 'pulse_low'
            duration_after_trigger: How long to capture after trigger
            sample_rate: Digital sample rate in Hz
            voltage_threshold: Logic level voltage
            channels: List of channels to enable

        Returns:
            Capture object or None on failure
        """
        if channels is None:
            channels = [DEFAULT_CONFIG['tx_channel'], DEFAULT_CONFIG['rx_channel']]

        # Map trigger type string to enum
        trigger_map = {
            'rising': DigitalTriggerType.RISING,
            'falling': DigitalTriggerType.FALLING,
            'pulse_high': DigitalTriggerType.PULSE_HIGH,
            'pulse_low': DigitalTriggerType.PULSE_LOW,
        }
        trigger = trigger_map.get(trigger_type, DigitalTriggerType.FALLING)

        device_config = LogicDeviceConfiguration(
            enabled_digital_channels=channels,
            digital_sample_rate=sample_rate,
            digital_threshold_volts=voltage_threshold,
        )

        capture_config = CaptureConfiguration(
            capture_mode=DigitalTriggerCaptureMode(
                trigger_channel_index=trigger_channel,
                trigger_type=trigger,
                after_trigger_seconds=duration_after_trigger,
            )
        )

        print(f"Waiting for trigger on channel {trigger_channel} ({trigger_type})...")
        print(f"  Will capture {duration_after_trigger}s after trigger")

        try:
            capture = self.manager.start_capture(
                device_id=self.device_id,
                device_configuration=device_config,
                capture_configuration=capture_config
            )
            capture.wait()
            print("Triggered! Capture complete.")
            return capture

        except Exception as e:
            print(f"Capture error: {e}")
            return None

    def capture_manual(
        self,
        sample_rate: int = DEFAULT_CONFIG['sample_rate'],
        voltage_threshold: float = DEFAULT_CONFIG['voltage_threshold'],
        channels: list = None
    ):
        """
        Start a manual capture (stop with Ctrl+C or capture.stop()).

        Returns:
            Capture object (still running) or None on failure
        """
        if channels is None:
            channels = [DEFAULT_CONFIG['tx_channel'], DEFAULT_CONFIG['rx_channel']]

        device_config = LogicDeviceConfiguration(
            enabled_digital_channels=channels,
            digital_sample_rate=sample_rate,
            digital_threshold_volts=voltage_threshold,
        )

        capture_config = CaptureConfiguration(
            capture_mode=ManualCaptureMode()
        )

        print("Starting manual capture...")
        print("  Press Ctrl+C to stop")

        try:
            capture = self.manager.start_capture(
                device_id=self.device_id,
                device_configuration=device_config,
                capture_configuration=capture_config
            )
            return capture

        except Exception as e:
            print(f"Capture error: {e}")
            return None

    def add_uart_analyzer(
        self,
        capture,
        channel: int,
        baud_rate: int = DEFAULT_CONFIG['baud_rate'],
        label: str = None
    ):
        """
        Add a UART (Async Serial) analyzer to a capture.

        Args:
            capture: Capture object
            channel: Channel to analyze
            baud_rate: Baud rate for decoding
            label: Optional label for the analyzer

        Returns:
            Analyzer object
        """
        if label is None:
            label = f'UART CH{channel}'

        print(f"Adding UART analyzer on channel {channel} at {baud_rate} baud...")

        analyzer = capture.add_analyzer(
            'Async Serial',
            label=label,
            settings={
                'Input Channel': channel,
                'Bit Rate (Bits/s)': baud_rate,
                'Bits per Frame': '8 Bits per Transfer (Standard)',
                'Stop Bits': '1 Stop Bit (Standard)',
                'Parity Bit': 'No Parity Bit (Standard)',
                'Significant Bit': 'Least Significant Bit Sent First (Standard)',
                'Signal Inversion': 'Non Inverted (Standard)',
            }
        )
        return analyzer

    def export_uart_data(
        self,
        capture,
        analyzers: list,
        output_file: str,
        radix: str = 'hex'
    ):
        """
        Export decoded UART data to a file.

        Args:
            capture: Capture object
            analyzers: List of analyzer objects to export
            output_file: Path to output file
            radix: 'hex', 'ascii', 'decimal', 'binary'
        """
        radix_map = {
            'hex': RadixType.HEXADECIMAL,
            'ascii': RadixType.ASCII,
            'decimal': RadixType.DECIMAL,
            'binary': RadixType.BINARY,
        }

        print(f"Exporting UART data to {output_file}...")

        capture.export_data_table(
            filepath=output_file,
            analyzers=analyzers,
            radix=radix_map.get(radix, RadixType.HEXADECIMAL),
        )
        print(f"Export complete: {output_file}")

    def export_raw_capture(self, capture, output_file: str):
        """
        Export raw capture data to CSV.

        Args:
            capture: Capture object
            output_file: Path to output file
        """
        print(f"Exporting raw capture to {output_file}...")
        capture.export_raw_data_csv(
            filepath=output_file,
            digital_channels=[DEFAULT_CONFIG['tx_channel'], DEFAULT_CONFIG['rx_channel']],
        )
        print(f"Export complete: {output_file}")

    def save_capture(self, capture, output_file: str):
        """
        Save capture to .sal file for later analysis in Logic 2.

        Args:
            capture: Capture object
            output_file: Path to .sal file
        """
        print(f"Saving capture to {output_file}...")
        capture.save_capture(filepath=output_file)
        print(f"Save complete: {output_file}")


def convert_to_analyze_format(csv_file: str, output_file: str):
    """
    Convert Saleae UART export to format expected by analyze_capture.py.

    Args:
        csv_file: Path to Saleae CSV export
        output_file: Path to output hex dump file
    """
    import csv

    print(f"Converting {csv_file} to analyze_capture.py format...")

    with open(csv_file, 'r') as infile, open(output_file, 'w') as outfile:
        reader = csv.DictReader(infile)

        for row in reader:
            # Saleae exports typically have columns like:
            # name, type, start_time, duration, data, ...
            # The exact format depends on the analyzer

            # Try to extract the data value
            data = row.get('data', row.get('Data', ''))
            analyzer_name = row.get('name', row.get('Name', ''))

            if data:
                # Determine direction based on analyzer name or channel
                if 'TX' in analyzer_name.upper() or 'CH0' in analyzer_name:
                    outfile.write(f"TX: {data}\n")
                elif 'RX' in analyzer_name.upper() or 'CH1' in analyzer_name:
                    outfile.write(f"RX: {data}\n")
                else:
                    outfile.write(f"{data}\n")

    print(f"Conversion complete: {output_file}")


def auto_detect_baud_rate(saleae: SaleaeCapture, channel: int = 0) -> int:
    """
    Attempt to auto-detect baud rate by trying common rates.

    This captures a short sample and tries decoding with different baud rates,
    looking for valid framing.
    """
    print("Attempting baud rate auto-detection...")

    # Capture a short sample
    capture = saleae.capture_timed(duration_seconds=1.0)
    if not capture:
        return DEFAULT_CONFIG['baud_rate']

    best_baud = DEFAULT_CONFIG['baud_rate']
    # Note: Full auto-detection would require analyzing framing errors
    # For now, return default and let user specify

    print(f"  Using default baud rate: {best_baud}")
    print("  Specify --baud if incorrect")

    return best_baud


def main():
    parser = argparse.ArgumentParser(
        description='Capture and analyze servo protocol with Saleae Logic 8',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --duration 5                    # 5-second timed capture
  %(prog)s --trigger --trigger-channel 0   # Trigger on falling edge
  %(prog)s --baud 115200 --output data.csv # Specify baud rate and output
  %(prog)s --continuous                    # Manual start/stop capture

Output files are saved to the 'captures/' directory by default.
        """
    )

    # Capture mode options
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument('--duration', '-d', type=float, default=5.0,
                           help='Capture duration in seconds (default: 5.0)')
    mode_group.add_argument('--trigger', '-t', action='store_true',
                           help='Use trigger-based capture')
    mode_group.add_argument('--continuous', '-c', action='store_true',
                           help='Manual capture (Ctrl+C to stop)')

    # Trigger options
    parser.add_argument('--trigger-channel', type=int, default=0,
                       help='Channel to trigger on (default: 0)')
    parser.add_argument('--trigger-type', choices=['rising', 'falling', 'pulse_high', 'pulse_low'],
                       default='falling', help='Trigger edge type (default: falling)')
    parser.add_argument('--after-trigger', type=float, default=1.0,
                       help='Seconds to capture after trigger (default: 1.0)')

    # Protocol options
    parser.add_argument('--baud', '-b', type=int, default=DEFAULT_CONFIG['baud_rate'],
                       help=f'UART baud rate (default: {DEFAULT_CONFIG["baud_rate"]})')
    parser.add_argument('--voltage', '-v', type=float, default=DEFAULT_CONFIG['voltage_threshold'],
                       help=f'Logic voltage threshold (default: {DEFAULT_CONFIG["voltage_threshold"]}V)')
    parser.add_argument('--sample-rate', '-s', type=int, default=DEFAULT_CONFIG['sample_rate'],
                       help=f'Sample rate in Hz (default: {DEFAULT_CONFIG["sample_rate"]})')

    # Channel options
    parser.add_argument('--tx-channel', type=int, default=DEFAULT_CONFIG['tx_channel'],
                       help=f'TX channel (default: {DEFAULT_CONFIG["tx_channel"]})')
    parser.add_argument('--rx-channel', type=int, default=DEFAULT_CONFIG['rx_channel'],
                       help=f'RX channel (default: {DEFAULT_CONFIG["rx_channel"]})')

    # Output options
    parser.add_argument('--output', '-o', type=str, default=None,
                       help='Output filename (auto-generated if not specified)')
    parser.add_argument('--output-dir', type=str, default='captures',
                       help='Output directory (default: captures/)')
    parser.add_argument('--no-save', action='store_true',
                       help='Do not save .sal capture file')
    parser.add_argument('--radix', choices=['hex', 'ascii', 'decimal', 'binary'],
                       default='hex', help='Output data format (default: hex)')

    # Connection options
    parser.add_argument('--port', '-p', type=int, default=DEFAULT_CONFIG['automation_port'],
                       help=f'Logic 2 automation port (default: {DEFAULT_CONFIG["automation_port"]})')

    args = parser.parse_args()

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(exist_ok=True)

    # Generate output filename if not specified
    if args.output:
        base_name = Path(args.output).stem
    else:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        base_name = f'axon_capture_{timestamp}'

    # Connect to Logic 2
    saleae = SaleaeCapture(port=args.port)
    if not saleae.connect():
        sys.exit(1)

    try:
        channels = [args.tx_channel, args.rx_channel]

        # Perform capture based on mode
        if args.trigger:
            capture = saleae.capture_triggered(
                trigger_channel=args.trigger_channel,
                trigger_type=args.trigger_type,
                duration_after_trigger=args.after_trigger,
                sample_rate=args.sample_rate,
                voltage_threshold=args.voltage,
                channels=channels
            )
        elif args.continuous:
            capture = saleae.capture_manual(
                sample_rate=args.sample_rate,
                voltage_threshold=args.voltage,
                channels=channels
            )
            try:
                print("\nCapturing... Press Ctrl+C to stop.\n")
                while True:
                    time.sleep(0.5)
            except KeyboardInterrupt:
                print("\nStopping capture...")
                capture.stop()
        else:
            capture = saleae.capture_timed(
                duration_seconds=args.duration,
                sample_rate=args.sample_rate,
                voltage_threshold=args.voltage,
                channels=channels
            )

        if not capture:
            print("Capture failed.")
            sys.exit(1)

        # Add UART analyzers
        tx_analyzer = saleae.add_uart_analyzer(
            capture,
            channel=args.tx_channel,
            baud_rate=args.baud,
            label='TX (Programmer→Servo)'
        )
        rx_analyzer = saleae.add_uart_analyzer(
            capture,
            channel=args.rx_channel,
            baud_rate=args.baud,
            label='RX (Servo→Programmer)'
        )

        # Export UART decoded data
        uart_csv = output_dir / f'{base_name}_uart.csv'
        saleae.export_uart_data(
            capture,
            analyzers=[tx_analyzer, rx_analyzer],
            output_file=str(uart_csv),
            radix=args.radix
        )

        # Convert to analyze_capture.py format
        hex_dump = output_dir / f'{base_name}.hex'
        convert_to_analyze_format(str(uart_csv), str(hex_dump))

        # Save .sal capture file
        if not args.no_save:
            sal_file = output_dir / f'{base_name}.sal'
            saleae.save_capture(capture, str(sal_file))

        print("\n" + "="*50)
        print("Capture complete!")
        print("="*50)
        print(f"  UART data:    {uart_csv}")
        print(f"  Hex dump:     {hex_dump}")
        if not args.no_save:
            print(f"  Capture file: {sal_file}")
        print("\nTo analyze:")
        print(f"  python tools/analyze_capture.py {hex_dump}")

    finally:
        saleae.disconnect()


if __name__ == '__main__':
    main()
