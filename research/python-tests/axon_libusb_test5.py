#!/usr/bin/env python3
"""
Fifth libusb test, built around the hypothesis from the 0xCD wire
capture in samples/saleae/0xcd-data.csv:

    The dongle is "dumb" — it forwards HID command bytes onto the
    1-wire servo bus and expects the host to handle flow control.
    Our previous libusb tests read HID IN too fast, before the
    servo's ~67 ms wire reply had finished streaming back, so we
    either got stale buffer contents or a half-filled report.

We now have the EXACT wire bytes the exe sees for a successful
Read of chunk 0 (addr=0, len=59), so we can validate any
libusb variant by comparing against them.

This script tests three variants of the read-chunk-0 transaction
in isolation, with a fresh primed state for each:

  Variant 1 — send 0xCD, sleep 80 ms, read one 64-byte HID report
  Variant 2 — send 0xCD, sleep 120 ms, drain all HID reports until
              timeout (tests whether the dongle splits the 65-byte
              wire reply across >1 HID reports)
  Variant 3 — send 0xCD, read one report with a long timeout (no
              explicit sleep — does libusb's blocking read suffice?)

For each variant we print the raw HID bytes, then do a byte-for-byte
diff against the expected wire data and print PASS/FAIL.

Read-only. Only 0x8A (identify) and 0xCD (read) are sent.

Run:
    sudo /Users/caryden/tools/axon-hw-venv/bin/python3 \\
         /Users/caryden/github/servo-programmer/tools/axon_libusb_test5.py
"""

from __future__ import annotations

import sys
import time

VID = 0x0471
PID = 0x13AA
EP_OUT = 0x01
EP_IN  = 0x81
REPORT_SIZE = 64

# Known-good wire reply for "read addr=0, len=0x3B" — the 59 data bytes
# that the servo returns on the wire after FF FF 01 3D 00. Captured in
# samples/saleae/0xcd-data.csv and validated against the decoder.
EXPECTED_CHUNK0 = bytes.fromhex(
    "3b d0 0b f6 82 82 80 03 00 3c 00 50 1e 00 00 c8"
    "09 dc dc dc 29 21 1d 19 14 00 3c 00 3c 00 3c 00"
    "00 00 00 00 01 e3 c0 00 50 00 50 00 50 00 00 00"
    "16 0a 16 00 00 78 32 64 50 50 64"
)
assert len(EXPECTED_CHUNK0) == 59


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


def is_present(rx: bytes) -> bool:
    return (len(rx) >= 8 and rx[1] == 0x01 and rx[2] == 0x00 and
            rx[5] in (0x03, 0x04) and rx[7] == 0x01)


def wait_for_present(dev, max_polls: int = 20) -> bool:
    """Poll identify at 300 ms until PRESENT."""
    print("  waiting for PRESENT...", flush=True)
    for i in range(max_polls):
        try:
            dev.write(EP_OUT, build_tx(0x8A, 0x00, 0x04), timeout=500)
            rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
            if is_present(rx):
                print(f"    poll {i+1}: PRESENT", flush=True)
                return True
            if i < 3 or i % 5 == 0:
                print(f"    poll {i+1}: rx[2]={rx[2]:#04x}", flush=True)
        except Exception as e:
            print(f"    poll {i+1}: {e}", flush=True)
        time.sleep(0.3)
    print("  never reached PRESENT — re-plug the servo and retry", flush=True)
    return False


def score(rx_data: bytes, label: str) -> None:
    """Diff rx_data against EXPECTED_CHUNK0 and print a verdict."""
    # We don't know exactly where in the HID report the data starts.
    # Try every offset 0..8 and report the best match.
    best_off = -1
    best_hits = -1
    for off in range(9):
        win = rx_data[off:off + 59]
        if len(win) < 59:
            break
        hits = sum(1 for i in range(59) if win[i] == EXPECTED_CHUNK0[i])
        if hits > best_hits:
            best_hits = hits
            best_off = off
    verdict = "PASS" if best_hits >= 59 else (
        "PARTIAL" if best_hits >= 30 else "FAIL")
    print(f"  [{label}] best match: {best_hits}/59 bytes at offset {best_off}"
          f"  -> {verdict}", flush=True)
    if 0 < best_hits < 59:
        # Show first mismatch
        win = rx_data[best_off:best_off + 59]
        for i in range(59):
            if win[i] != EXPECTED_CHUNK0[i]:
                print(f"    first diff at data[{i}]: got 0x{win[i]:02x}, "
                      f"expected 0x{EXPECTED_CHUNK0[i]:02x}", flush=True)
                break


def variant_1(dev) -> None:
    """Send 0xCD, sleep 80 ms, read one report."""
    print()
    print("=== Variant 1: send 0xCD, sleep 80 ms, read one report ===",
          flush=True)
    if not wait_for_present(dev):
        return
    dev.write(EP_OUT, build_tx(0xCD, 0x00, 0x3B), timeout=500)
    time.sleep(0.080)
    rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
    print("  got 1 report:")
    print(hexdump(rx))
    score(rx, "v1")


def variant_2(dev) -> None:
    """Send 0xCD, sleep 120 ms, drain all reports until timeout."""
    print()
    print("=== Variant 2: send 0xCD, sleep 120 ms, drain all reports ===",
          flush=True)
    if not wait_for_present(dev):
        return
    dev.write(EP_OUT, build_tx(0xCD, 0x00, 0x3B), timeout=500)
    time.sleep(0.120)
    reports: list[bytes] = []
    for attempt in range(6):
        try:
            rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=100))
            if not rx:
                break
            reports.append(rx)
        except Exception as e:
            # Read timeout — assume drain is done
            print(f"  drain stopped after {len(reports)} reports: {e}",
                  flush=True)
            break
    print(f"  drained {len(reports)} report(s)", flush=True)
    for i, r in enumerate(reports):
        print(f"  --- report {i+1} ---")
        print(hexdump(r))
    # Score by concatenating all reports (minus the first-byte report id)
    concat = b"".join(r[1:] for r in reports)
    if concat:
        score(concat, "v2-concat")
    # Also score the first report alone, in case that's where the data is
    if reports:
        score(reports[0], "v2-first")


def variant_3(dev) -> None:
    """Send 0xCD, immediate blocking read with long timeout."""
    print()
    print("=== Variant 3: send 0xCD, blocking read (long timeout) ===",
          flush=True)
    if not wait_for_present(dev):
        return
    dev.write(EP_OUT, build_tx(0xCD, 0x00, 0x3B), timeout=500)
    t0 = time.monotonic()
    rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=2000))
    dt_ms = (time.monotonic() - t0) * 1000
    print(f"  read returned after {dt_ms:.1f} ms", flush=True)
    print(hexdump(rx))
    score(rx, "v3")


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
    print(f"found: {dev.manufacturer!r} {dev.product!r}", flush=True)

    try:
        if dev.is_kernel_driver_active(0):
            dev.detach_kernel_driver(0)
    except Exception:
        pass
    try:
        dev.set_configuration()
        usb.util.claim_interface(dev, 0)
        print("claimed interface 0", flush=True)
    except usb.core.USBError as e:
        sys.stderr.write(f"could not claim interface: {e}\n")
        return 1

    try:
        variant_1(dev)
        variant_2(dev)
        variant_3(dev)
    finally:
        try:
            usb.util.release_interface(dev, 0)
        except Exception:
            pass
        try:
            dev.attach_kernel_driver(0)
        except Exception:
            pass
        print("\nre-attached kernel driver", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
