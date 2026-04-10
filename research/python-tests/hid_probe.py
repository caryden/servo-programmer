#!/usr/bin/env python3
"""
Phase 1 of the Axon servo programmer runtime validation.

Enumerates USB HID devices, finds the Axon programmer by
VID 0x0471 / PID 0x13AA, opens it, and prints everything it can learn
from the descriptor. Safe to run without a servo attached — this only
exercises the HID descriptor path on the PC side; no commands are sent
to the servo.

Usage:
    source ~/tools/axon-hw-venv/bin/activate
    python3 tools/hid_probe.py
"""

from __future__ import annotations

import sys

AXON_VID = 0x0471
AXON_PID = 0x13AA


def fmt_hex(v: int | None, width: int = 4) -> str:
    if v is None:
        return "?"
    return f"0x{v:0{width}x}"


def main() -> int:
    try:
        import hid  # type: ignore
    except ImportError:
        sys.stderr.write(
            "hidapi not installed.\n"
            "  source ~/tools/axon-hw-venv/bin/activate\n"
            "  pip install hidapi\n"
        )
        return 2

    all_devices = hid.enumerate()
    print(f"=== HID enumeration ===")
    print(f"total HID devices on this system: {len(all_devices)}")

    # Find all matching VID/PID (there may be multiple HID interfaces on the
    # same physical device — print them all so we can pick the right one).
    axon = [
        d for d in all_devices
        if d.get("vendor_id") == AXON_VID and d.get("product_id") == AXON_PID
    ]
    print(f"devices matching VID {fmt_hex(AXON_VID)} PID {fmt_hex(AXON_PID)}: {len(axon)}")
    if not axon:
        print("\nNo Axon programmer found. Things to check:")
        print("  - Is the USB dongle plugged in?")
        print("  - Is another process holding it open (browser with Web HID,")
        print("    the vendor .exe running in Parallels, etc.)?")
        # Still dump a short vendor summary so we can tell what the OS sees.
        from collections import Counter
        vid_counts = Counter(d.get("vendor_id") for d in all_devices)
        print("\n  Vendors present on this bus (top 10 by device count):")
        for vid, cnt in vid_counts.most_common(10):
            print(f"    {fmt_hex(vid)}  x {cnt}")
        return 1

    for i, d in enumerate(axon):
        print(f"\n-- interface {i} --")
        print(f"  path             : {d.get('path')!r}")
        print(f"  vendor_id        : {fmt_hex(d.get('vendor_id'))}")
        print(f"  product_id       : {fmt_hex(d.get('product_id'))}")
        print(f"  release_number   : {fmt_hex(d.get('release_number'))}")
        print(f"  manufacturer     : {d.get('manufacturer_string')!r}")
        print(f"  product          : {d.get('product_string')!r}")
        print(f"  serial_number    : {d.get('serial_number')!r}")
        print(f"  interface_number : {d.get('interface_number')}")
        print(f"  usage_page       : {fmt_hex(d.get('usage_page'))}")
        print(f"  usage            : {fmt_hex(d.get('usage'))}")

    # Try to open the first interface
    target = axon[0]
    print(f"\n=== Opening interface 0 ({target['path']!r}) ===")
    dev = hid.device()
    try:
        dev.open_path(target["path"])
    except Exception as e:
        print(f"  open_path failed: {e}")
        print(f"  falling back to open(vid, pid)")
        try:
            dev.open(AXON_VID, AXON_PID)
        except Exception as e2:
            print(f"  open by vid/pid also failed: {e2}")
            return 1
    print("  open: OK")

    # Read the string descriptors directly off the open handle, in case they
    # differ from what enumerate() returned (they usually don't, but hidapi's
    # enumerate cache has been known to be stale on macOS).
    try:
        print(f"  Manufacturer : {dev.get_manufacturer_string()!r}")
        print(f"  Product      : {dev.get_product_string()!r}")
        print(f"  Serial       : {dev.get_serial_number_string()!r}")
    except Exception as e:
        print(f"  (reading strings failed: {e})")

    dev.set_nonblocking(False)

    # Poll for any spontaneous input report. The device should not be sending
    # anything unless it was already in the middle of a session; if we see
    # bytes here, we'll learn the native input report length (with or without
    # the Report ID prefix).
    print(f"\n=== Input report poll (1000 ms) ===")
    try:
        r = dev.read(64, timeout_ms=1000)
    except Exception as e:
        print(f"  read failed: {e}")
        r = None
    if r:
        print(f"  got {len(r)} bytes: {bytes(r).hex()}")
    else:
        print("  no spontaneous report (expected — the device waits for a command)")

    dev.close()
    print("\nDone. Safe-mode probe complete, no commands were sent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
