#!/usr/bin/env python3
"""
Quick status check: is the Axon dongle present on USB, and does the
servo report PRESENT when we ping it?

Non-destructive — sends 3 identify polls (0x8A) at 300 ms cadence
and prints a verdict. Does NOT issue dev.reset() or any write.

Run:
    sudo /Users/caryden/tools/axon-hw-venv/bin/python3 \\
         /Users/caryden/github/servo-programmer/tools/axon_libusb_test_status.py
"""

from __future__ import annotations

import sys
import time

VID = 0x0471
PID = 0x13AA
EP_OUT = 0x01
EP_IN  = 0x81
REPORT_SIZE = 64


def build_identify() -> bytes:
    tx = bytearray(REPORT_SIZE)
    tx[0] = 0x04  # report id
    tx[1] = 0x8A  # identify
    tx[2] = 0x00
    tx[3] = 0x00
    tx[4] = 0x04
    return bytes(tx)


def describe(rx: bytes) -> str:
    if len(rx) < 8:
        return f"short reply ({len(rx)} bytes)"
    status = rx[2]
    if rx[1] == 0x01 and status == 0x00 and rx[5] in (0x03, 0x04) and rx[7] == 0x01:
        return "SERVO PRESENT"
    if status == 0xFA:
        return "servo absent (0xFA)"
    if status == 0x02:
        return "command nacked (0x02)"
    return f"unknown (rx[1]={rx[1]:#04x} rx[2]={rx[2]:#04x})"


def main() -> int:
    try:
        import usb.core, usb.util
    except ImportError:
        sys.stderr.write("pyusb not installed in this venv\n")
        return 2

    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        print("DONGLE: NOT FOUND on USB")
        print("  (VID=0x0471 PID=0x13AA not enumerated)")
        return 1
    print(f"DONGLE: {dev.manufacturer!r} {dev.product!r} "
          f"bus={dev.bus} addr={dev.address}")

    try:
        if dev.is_kernel_driver_active(0):
            dev.detach_kernel_driver(0)
    except Exception:
        pass
    try:
        dev.set_configuration()
        usb.util.claim_interface(dev, 0)
    except usb.core.USBError as e:
        sys.stderr.write(f"could not claim interface: {e}\n")
        sys.stderr.write("(needs sudo on macOS)\n")
        return 1

    try:
        print()
        print("identify x3 @ 300 ms:")
        present_count = 0
        for i in range(3):
            try:
                dev.write(EP_OUT, build_identify(), timeout=500)
                rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
                verdict = describe(rx)
                print(f"  poll {i+1}: {verdict}  rx[:8]={rx[:8].hex()}")
                if verdict == "SERVO PRESENT":
                    present_count += 1
            except Exception as e:
                print(f"  poll {i+1}: EXCEPTION {e}")
            time.sleep(0.3)

        print()
        if present_count == 3:
            print("=> ADAPTER CONNECTED and SERVO PLUG IN (3/3 present)")
        elif present_count > 0:
            print(f"=> FLAKY: {present_count}/3 polls saw the servo")
        else:
            print("=> ADAPTER CONNECTED but NO SERVO (dongle cold-state)")
    finally:
        try:
            usb.util.release_interface(dev, 0)
        except Exception:
            pass
        try:
            dev.attach_kernel_driver(0)
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
