#!/usr/bin/env python3
"""
Refined libusb test based on the breakthrough finding that libusb works
where hidapi doesn't.

The first libusb test (axon_libusb_test.py) proved:
  1. macOS hidapi was the gap, not the bytes we send. With raw libusb
     interrupt-OUT/IN we get PRESENT consistently and the read returns
     partial servo data.
  2. Set_Idle is not required — the dongle STALLs it (Pipe error) and
     Windows hidclass.sys silently ignores the STALL.
  3. The read reply format depends on wire-side state — when the dongle
     is in PRESENT state we get `04 01 02 3b 24 ... <data>` instead of
     the no-servo `04 cd 02 00 <len> <zeros>` format.
  4. We saw partial data in rd 1: trailing bytes "A33**" are part of
     the servo model ID at flash addr 0x40..0x47.

This script:
  - Skips Set_Idle entirely (we know it stalls)
  - Polls identify at the .exe's exact 300 ms cadence
  - Once PRESENT is stable for >=3 polls, runs an interleaved read burst
    that mimics the ETW trace timing (~100 ms between requests in the
    burst region, which is the .exe's "Read parameters" pace)
  - Prints the FULL 64-byte reply for every command, not just rx[0..16]
  - Tries a few read variants if the first attempt returns partial data

Run with:
  sudo ~/tools/axon-hw-venv/bin/python3 tools/axon_libusb_test2.py
"""

from __future__ import annotations

import os
import sys
import time

VID = 0x0471
PID = 0x13AA
EP_OUT = 0x01
EP_IN  = 0x81
REPORT_SIZE = 64
CONFIG_BLOCK_LEN = 0x5F  # 95 bytes
CHUNK_0_LEN = 0x3B       # 59 bytes
CHUNK_1_LEN = 0x24       # 36 bytes


def hexdump(data: bytes, *, indent: str = "    ", width: int = 16) -> str:
    out = []
    for off in range(0, len(data), width):
        chunk = data[off:off + width]
        h = " ".join(f"{b:02x}" for b in chunk)
        a = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        out.append(f"{indent}0x{off:02x}  {h:<{width*3-1}s}  {a}")
    return "\n".join(out)


def write_then_read(dev, label: str, tx_bytes: list, *, show_full: bool = True) -> bytes:
    """Send a 64-byte HID report and read the 64-byte reply. Print both."""
    tx = bytes(tx_bytes) + b"\x00" * (REPORT_SIZE - len(tx_bytes))
    n = dev.write(EP_OUT, tx, timeout=500)
    if n != REPORT_SIZE:
        raise IOError(f"{label}: write returned {n}")
    rx_arr = dev.read(EP_IN, REPORT_SIZE, timeout=500)
    rx = bytes(rx_arr)
    if show_full:
        print(f"  {label}:")
        print(hexdump(rx))
    else:
        print(f"  {label}  rx[0..16]={rx[:16].hex()}  rx[1]={rx[1]:#04x} rx[2]={rx[2]:#04x}")
    return rx


def is_present(rx: bytes) -> bool:
    return (len(rx) >= 8 and rx[1] == 0x01 and rx[2] == 0x00 and
            rx[5] in (0x03, 0x04) and rx[7] == 0x01)


def main() -> int:
    try:
        import usb.core, usb.util
    except ImportError:
        sys.stderr.write("pyusb not installed\n")
        return 2

    print("=== Phase 0: Find and claim the dongle via libusb ===")
    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        sys.stderr.write("dongle not found\n")
        return 1
    print(f"  found: {dev.manufacturer!r} {dev.product!r}")

    try:
        if dev.is_kernel_driver_active(0):
            dev.detach_kernel_driver(0)
            print("  detached kernel HID driver")
    except (NotImplementedError, usb.core.USBError):
        pass

    try:
        dev.set_configuration()
        usb.util.claim_interface(dev, 0)
        print("  configuration set, interface 0 claimed")
    except usb.core.USBError as e:
        sys.stderr.write(f"could not claim interface: {e}\n")
        sys.stderr.write("hint: this script needs sudo on macOS\n")
        return 1

    try:
        # Phase 1: identify polling at 300 ms cadence to confirm stable PRESENT
        print()
        print("=== Phase 1: identify poll at 300 ms cadence (5 polls) ===")
        present_count = 0
        for poll in range(5):
            rx = write_then_read(
                dev, f"poll {poll+1}",
                [0x04, 0x8A, 0x00, 0x00, 0x04],
                show_full=False,
            )
            if is_present(rx):
                present_count += 1
            time.sleep(0.3)
        if present_count < 4:
            print(f"  only {present_count}/5 polls were PRESENT — bailing")
            return 1
        print(f"  {present_count}/5 polls were PRESENT — wire-side state stable")

        # Phase 2: Try the read in several different variants and look at the
        # FULL 64-byte reply each time, so we can see what's really in the
        # data field.
        print()
        print("=== Phase 2: read variant tests (with full hex dump) ===")
        print()

        variants = [
            ("immediate after id, addr=0, len=59",
             [(0x04, 0x8A, 0x00, 0x00, 0x04), (0x04, 0xCD, 0x00, 0x00, 0x3B)],
             0.0),
            ("100ms after id, addr=0, len=59",
             [(0x04, 0x8A, 0x00, 0x00, 0x04), (0x04, 0xCD, 0x00, 0x00, 0x3B)],
             0.1),
            ("300ms after id, addr=0, len=59",
             [(0x04, 0x8A, 0x00, 0x00, 0x04), (0x04, 0xCD, 0x00, 0x00, 0x3B)],
             0.3),
            ("immediate after id, addr=0, len=16",
             [(0x04, 0x8A, 0x00, 0x00, 0x04), (0x04, 0xCD, 0x00, 0x00, 0x10)],
             0.0),
            ("immediate after id, addr=0x3b, len=36",
             [(0x04, 0x8A, 0x00, 0x00, 0x04), (0x04, 0xCD, 0x00, 0x3B, 0x24)],
             0.0),
            ("immediate after id, addr=0x40, len=8 (model ID region)",
             [(0x04, 0x8A, 0x00, 0x00, 0x04), (0x04, 0xCD, 0x00, 0x40, 0x08)],
             0.0),
        ]

        for variant_name, cmds, gap in variants:
            print(f"--- variant: {variant_name} ---")
            for i, cmd in enumerate(cmds):
                if i > 0 and gap > 0:
                    time.sleep(gap)
                label = "id" if cmd[1] == 0x8A else "rd"
                write_then_read(dev, label, list(cmd), show_full=True)
            print()
            time.sleep(0.4)  # cool-down between variants

        # Phase 3: try MULTIPLE consecutive reads of the same chunk to see
        # if data accumulates or arrives in a second response
        print()
        print("=== Phase 3: multiple consecutive reads of same chunk ===")
        write_then_read(dev, "id", [0x04, 0x8A, 0x00, 0x00, 0x04], show_full=False)
        for attempt in range(5):
            rx = write_then_read(
                dev, f"rd attempt {attempt+1} (addr=0, len=59)",
                [0x04, 0xCD, 0x00, 0x00, 0x3B],
                show_full=True,
            )
            time.sleep(0.05)

        # Phase 4: try reading WITHOUT preceding identify
        print()
        print("=== Phase 4: read with no preceding identify (after 300ms id) ===")
        write_then_read(dev, "id", [0x04, 0x8A, 0x00, 0x00, 0x04], show_full=False)
        time.sleep(0.3)
        rx = write_then_read(
            dev, "rd standalone (addr=0, len=59)",
            [0x04, 0xCD, 0x00, 0x00, 0x3B],
            show_full=True,
        )

    finally:
        try:
            usb.util.release_interface(dev, 0)
        except Exception:
            pass
        try:
            dev.attach_kernel_driver(0)
            print("\nre-attached kernel HID driver")
        except (NotImplementedError, usb.core.USBError):
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
