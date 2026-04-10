#!/usr/bin/env python3
"""
Fourth libusb test. Extracts maximum information from ONE primed state
by keeping the device open across many operations in a tight loop,
without ever closing or re-enumerating.

Observations from test2/test3:

  - libusb identify polling at 300 ms is stable (we got 5/5 PRESENT)
  - the FIRST read after polling returns 64 bytes (rx[2]=0x02) that
    contain real servo data ending in 0xA5
  - subsequent tests that re-run `wait_for_present` between variants
    got 0xFA forever

Hypothesis being tested here: maybe the problem wasn't the read itself
decaying the state, but rather the `wait_for_present` between variants.
If we keep the device open and do EVERYTHING in one burst without ever
calling a "re-prime" routine, we might get many successful reads in a
row, interleaved with keepalive identifies the way the exe does it.

Sequence:
  1. Open, claim, drain
  2. Baseline: poll identify 5x at 300 ms cadence (confirms PRESENT)
  3. Then DO NOT return to baseline. Stay in-burst and:
     - id (keepalive)
     - rd addr=0x00 len=0x10  (small chunk, first 16 bytes)
     - id (keepalive)
     - rd addr=0x00 len=0x10  (same again, is it stable?)
     - id (keepalive)
     - rd addr=0x00 len=0x3B  (full chunk 0, 59 bytes)
     - id (keepalive)
     - rd addr=0x3B len=0x24  (chunk 1, 36 bytes)
     - id (keepalive)
     - rd addr=0x40 len=0x08  (model ID region, known target)
     - id (keepalive)
     - rd addr=0x5E len=0x02  (sentinel region, should be 0xA5)
     - id (final check)

Every reply is printed as a full 64-byte hexdump so we can see exactly
what the dongle returns regardless of what we thought the layout was.

Read-only — only sends 0x8A (identify) and 0xCD (read). Never writes
to flash.

Run:
    sudo /Users/caryden/tools/axon-hw-venv/bin/python3 \\
         /Users/caryden/github/servo-programmer/tools/axon_libusb_test4.py
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


def hexdump(buf: bytes, *, indent: str = "    ") -> str:
    lines: list[str] = []
    for off in range(0, len(buf), 16):
        chunk = buf[off:off + 16]
        h = " ".join(f"{b:02x}" for b in chunk)
        a = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        lines.append(f"{indent}0x{off:02x}  {h:<47s}  {a}")
    return "\n".join(lines)


def build_tx(cmd: int, addr: int, chunk_len: int) -> bytes:
    tx = bytearray(REPORT_SIZE)
    tx[0] = 0x04
    tx[1] = cmd
    tx[2] = (addr >> 8) & 0xff
    tx[3] = addr & 0xff
    tx[4] = chunk_len
    return bytes(tx)


def write_and_read(dev, label: str, cmd: int, addr: int, chunk_len: int,
                   show_full: bool = True) -> bytes:
    tx = build_tx(cmd, addr, chunk_len)
    dev.write(EP_OUT, tx, timeout=500)
    rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
    if show_full:
        print(f"  {label:<28s}")
        print(hexdump(rx))
    else:
        print(f"  {label:<28s}  rx[0..16]={rx[:16].hex()}  rx[1]={rx[1]:#04x} rx[2]={rx[2]:#04x}")
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

    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        sys.stderr.write("dongle not found\n")
        return 1
    print(f"found: {dev.manufacturer!r} {dev.product!r}")

    try:
        if dev.is_kernel_driver_active(0):
            dev.detach_kernel_driver(0)
    except Exception:
        pass
    try:
        dev.set_configuration()
        usb.util.claim_interface(dev, 0)
        print("claimed interface 0")
    except usb.core.USBError as e:
        sys.stderr.write(f"could not claim interface: {e}\n")
        return 1

    try:
        # --- Baseline: 5 polls at 300 ms cadence to confirm PRESENT ---
        print()
        print("=== Baseline: identify x5 @ 300 ms ===")
        present_count = 0
        for i in range(5):
            rx = write_and_read(
                dev, f"poll {i+1}", 0x8A, 0x00, 0x04, show_full=False)
            if is_present(rx):
                present_count += 1
            time.sleep(0.3)
        print(f"  {present_count}/5 polls were PRESENT")
        if present_count < 3:
            print("  baseline not stable, bailing")
            return 1

        # --- Burst: many operations in tight loop, no re-prime ---
        print()
        print("=== Burst: id+rd interleave, full hex dumps ===")
        print("  (this is the same state the baseline polling produced)")
        print()

        steps = [
            ("id-A",            0x8A, 0x00, 0x04),
            ("rd addr=0 len=16 (first)",   0xCD, 0x00, 0x10),
            ("id-B",            0x8A, 0x00, 0x04),
            ("rd addr=0 len=16 (repeat)",  0xCD, 0x00, 0x10),
            ("id-C",            0x8A, 0x00, 0x04),
            ("rd addr=0 len=59 (chunk0)",  0xCD, 0x00, 0x3B),
            ("id-D",            0x8A, 0x00, 0x04),
            ("rd addr=0x3b len=36 (chunk1)", 0xCD, 0x3B, 0x24),
            ("id-E",            0x8A, 0x00, 0x04),
            ("rd addr=0x40 len=8 (model ID)", 0xCD, 0x40, 0x08),
            ("id-F",            0x8A, 0x00, 0x04),
            ("rd addr=0x5e len=2 (sentinel)", 0xCD, 0x5E, 0x02),
            ("id-G",            0x8A, 0x00, 0x04),
            ("rd addr=0 len=95 (full block)", 0xCD, 0x00, 0x3B),
        ]

        results: list[tuple[str, bytes]] = []
        for label, cmd, addr, length in steps:
            try:
                rx = write_and_read(dev, label, cmd, addr, length)
                results.append((label, rx))
            except Exception as e:
                print(f"  {label}: EXCEPTION {e}")
                results.append((label, b""))
            print()
            # Tiny delay between ops to avoid hammering the wire side
            time.sleep(0.005)

        # --- Analysis pass -------------------------------------------------
        print()
        print("=== Analysis ===")
        print()
        print("  identify results across the burst:")
        for label, rx in results:
            if not rx or not label.startswith("id"):
                continue
            tag = "PRESENT" if is_present(rx) else f"rx[2]={rx[2]:#04x}"
            print(f"    {label:10s}  {tag}")

        print()
        print("  read results across the burst:")
        for label, rx in results:
            if not rx or not label.startswith("rd"):
                continue
            # Classify the reply format
            rx1, rx2 = rx[1], rx[2]
            if rx1 == 0x01 and rx2 == 0x00:
                cls = "SUCCESS"
            elif rx1 == 0x01 and rx2 == 0x02:
                cls = "partial/mixed"
            elif rx1 in (0xcd, 0xcb) and rx2 == 0x02:
                cls = "no-servo/fail"
            else:
                cls = f"rx[1]={rx1:#04x} rx[2]={rx2:#04x}"
            # Non-zero bytes in the data field
            data = rx[5:5 + 59]
            non_zero = sum(1 for b in data if b != 0)
            print(f"    {label:40s} {cls:<18s}  non-zero data bytes: {non_zero}/{len(data)}")

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
