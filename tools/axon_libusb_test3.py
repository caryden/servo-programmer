#!/usr/bin/env python3
"""
Third libusb test, designed around the breakthrough finding from
axon_libusb_test2.py:

  - libusb identify polling at 300 ms is stable (5/5 PRESENT)
  - the FIRST read after the polling baseline returns 59 bytes of
    actual non-zero data ending in 0xA5
  - the data does not match mini.svo and has 6 leading zero bytes
  - subsequent reads decay the wire-side state for the rest of the test

This script tests four hypotheses, in isolation, with a fresh "primed"
state for each (you may need to re-plug the servo between tests):

  Test A — drain extra input reports after one write
    Maybe the dongle sends multiple reports per request (e.g. an ack
    + a data frame). We only catch the first one. Read until empty.

  Test B — small reads to map out the data layout
    Read len=1 starting at addr=0, then len=2, 4, 8, 16. Look at where
    the non-zero bytes appear in each response. Tells us the data field
    offset definitively.

  Test C — read the model ID at addr=0x40, len=8
    Known target. If we get back ASCII bytes that look like "SA33****"
    or similar, the address parameter actually selects flash offset
    and we have a working flash-read primitive.

  Test D — interleaved reads with continuous 300ms identify keepalive
    Maybe the dongle expects an identify between every read to maintain
    wire-side state. Test by spacing reads 300 ms apart with an identify
    in each interval.

Each test is preceded by a "wait for fresh PRESENT" phase. If we don't
see PRESENT, we tell the user to physically re-plug the servo.

Run:
    sudo ~/tools/axon-hw-venv/bin/python3 tools/axon_libusb_test3.py
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


def hexdump(data: bytes, *, indent: str = "    ", width: int = 16) -> str:
    out = []
    for off in range(0, len(data), width):
        chunk = data[off:off + width]
        h = " ".join(f"{b:02x}" for b in chunk)
        a = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        out.append(f"{indent}0x{off:02x}  {h:<{width*3-1}s}  {a}")
    return "\n".join(out)


def write(dev, tx_bytes: list, *, timeout_ms: int = 500) -> None:
    tx = bytes(tx_bytes) + b"\x00" * (REPORT_SIZE - len(tx_bytes))
    n = dev.write(EP_OUT, tx, timeout=timeout_ms)
    if n != REPORT_SIZE:
        raise IOError(f"write returned {n}")


def read_one(dev, *, timeout_ms: int = 500) -> bytes:
    return bytes(dev.read(EP_IN, REPORT_SIZE, timeout=timeout_ms))


def drain(dev, *, timeout_ms: int = 50) -> list[bytes]:
    """Read input reports until empty/timeout."""
    out = []
    try:
        while True:
            r = read_one(dev, timeout_ms=timeout_ms)
            if not r:
                break
            out.append(r)
    except Exception:
        pass
    return out


def is_present(rx: bytes) -> bool:
    return (len(rx) >= 8 and rx[1] == 0x01 and rx[2] == 0x00 and
            rx[5] in (0x03, 0x04) and rx[7] == 0x01)


def wait_for_present(dev, max_polls: int = 30) -> bool:
    """Poll identify at 300 ms cadence until PRESENT, or until max_polls."""
    print("  waiting for PRESENT...")
    for poll in range(max_polls):
        try:
            write(dev, [0x04, 0x8A, 0x00, 0x00, 0x04])
            rx = read_one(dev)
        except Exception as e:
            print(f"    poll {poll+1}: {e}")
            time.sleep(0.3)
            continue
        if is_present(rx):
            print(f"    poll {poll+1}: PRESENT")
            return True
        if poll < 3 or poll % 5 == 0:
            print(f"    poll {poll+1}: rx[2]={rx[2]:#04x}")
        time.sleep(0.3)
    print("  PRESENT never reached. Re-plug the servo.")
    return False


def confirm_stable(dev, polls: int = 4) -> bool:
    """Confirm we get >=polls PRESENT in a row."""
    seen = 0
    for i in range(polls + 2):
        write(dev, [0x04, 0x8A, 0x00, 0x00, 0x04])
        rx = read_one(dev)
        if is_present(rx):
            seen += 1
        time.sleep(0.3)
    return seen >= polls


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
    except usb.core.USBError as e:
        sys.stderr.write(f"could not claim interface: {e}\n"
                         "(needs sudo on macOS)\n")
        return 1

    try:
        # ----- Initial baseline: confirm stable PRESENT --------------------
        print()
        print("=== Baseline: poll until PRESENT, confirm stable ===")
        if not wait_for_present(dev):
            return 1
        print(f"  stable: {confirm_stable(dev)}")

        # ----- Test A: drain extra input reports after one write -----------
        print()
        print("=== Test A: drain all input reports after one cmd 0xCD write ===")
        print("  (looking for a hidden second report carrying the real data)")
        if not wait_for_present(dev, max_polls=5):
            print("  skipping test A — no PRESENT")
        else:
            # Send cmd 0xCD addr=0, len=59
            write(dev, [0x04, 0xCD, 0x00, 0x00, 0x3B])
            # Drain everything we can get
            time.sleep(0.05)
            replies = drain(dev, timeout_ms=200)
            print(f"  received {len(replies)} input reports after one write")
            for i, r in enumerate(replies):
                print(f"  --- report {i+1} ---")
                print(hexdump(r))
            if len(replies) > 1:
                print("  >>> MULTIPLE REPORTS <<< — the dongle splits responses across reports!")
            elif len(replies) == 1:
                print("  only one report — same as before")

        # ----- Test B: small reads to find data offset ---------------------
        print()
        print("=== Test B: read with progressively larger lengths ===")
        print("  (to find where the data field starts in the reply)")
        for length in [1, 2, 4, 8, 16, 32, 59]:
            if not wait_for_present(dev, max_polls=8):
                print(f"  giving up — could not get PRESENT for len={length}")
                break
            try:
                write(dev, [0x04, 0xCD, 0x00, 0x00, length])
                rx = read_one(dev)
                print(f"  len={length:2d}:")
                print(hexdump(rx))
            except Exception as e:
                print(f"  len={length}: {e}")

        # ----- Test C: read the model ID region (addr=0x40 len=8) ----------
        print()
        print("=== Test C: read addr=0x40 len=8 (model ID region) ===")
        print("  (known target — we expect an ASCII model name like 'SA33****')")
        if wait_for_present(dev, max_polls=8):
            try:
                write(dev, [0x04, 0xCD, 0x00, 0x40, 0x08])
                rx = read_one(dev)
                print(hexdump(rx))
                ascii_view = rx[5:5+8].replace(b"*", b" ").decode("ascii", "replace")
                print(f"  rx[5..13] as ASCII: {ascii_view!r}")
            except Exception as e:
                print(f"  failed: {e}")

        # ----- Test D: interleaved reads with 300ms keepalive --------------
        print()
        print("=== Test D: chained reads with 300ms identify keepalive ===")
        if wait_for_present(dev, max_polls=8):
            for round_idx in range(3):
                # 300ms keepalive identify
                write(dev, [0x04, 0x8A, 0x00, 0x00, 0x04])
                rx_id = read_one(dev)
                # immediately try a read
                write(dev, [0x04, 0xCD, 0x00, 0x00, 0x10])
                rx_rd = read_one(dev)
                print(f"  round {round_idx+1}:")
                print(f"    id rx[1..3]={rx_id[1:3].hex()} ({'PRESENT' if rx_id[2]==0 else 'not'})")
                print(f"    rd rx[1..5]={rx_rd[1:5].hex()}")
                print(f"    rd full:")
                print(hexdump(rx_rd))
                time.sleep(0.3)

    finally:
        try:
            usb.util.release_interface(dev, 0)
        except Exception:
            pass
        try:
            dev.attach_kernel_driver(0)
        except Exception:
            pass
        print("\nre-attached kernel driver")

    return 0


if __name__ == "__main__":
    sys.exit(main())
