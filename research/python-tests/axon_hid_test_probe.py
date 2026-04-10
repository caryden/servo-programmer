#!/usr/bin/env python3
"""
HID-only retry: does the simple `hid` (hidapi) package work for
identify + read-chunk-0, now that we understand the protocol state
machine correctly?

This script intentionally does NOT need sudo (hidapi on macOS goes
through IOKit's HID framework, not libusb). If it works, we can
drop libusb + sudo from the Axon CLI entirely.

Sequence mirrors tools/axon_libusb_test7.py:
  - open device (no reset, no SET_IDLE, no fiddling)
  - identify x3 at 300 ms cadence
  - read chunk 0 (0xCD addr=0 len=0x3B)
  - read chunk 1 (0xCD addr=0x3B len=0x24)
  - verify chunk 0 bytes match the known-good wire data

Expected "primed" starting state: adapter connected, servo plug in
(after the proper plug-in order). Script will tell you if the
dongle is cold.

Run (no sudo!):
    /Users/caryden/tools/axon-hw-venv/bin/python3 \\
        /Users/caryden/github/servo-programmer/tools/axon_hid_test_probe.py
"""

from __future__ import annotations

import sys
import time

VID = 0x0471
PID = 0x13AA
REPORT_SIZE = 64  # nominal HID report size

# Known-good wire reply for "read addr=0, len=0x3B" on our primed Mini.
# Captured in samples/saleae/dual_test7_623.csv.
EXPECTED_CHUNK0 = bytes.fromhex(
    "3b d0 0b f6 82 82 80 03 00 3c 00 50 10 00 00 c8"
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


def build_payload(cmd: int, addr: int, chunk_len: int) -> list[int]:
    """Build a 64-byte HID output report payload (report ID 0x04 first)."""
    tx = [0] * REPORT_SIZE
    tx[0] = 0x04
    tx[1] = cmd
    tx[2] = (addr >> 8) & 0xff
    tx[3] = addr & 0xff
    tx[4] = chunk_len
    return tx


def is_present(rx: bytes) -> bool:
    return (len(rx) >= 8 and rx[1] == 0x01 and rx[2] == 0x00 and
            rx[5] in (0x03, 0x04) and rx[7] == 0x01)


def try_open(hid_mod):
    """Try opening the Axon dongle via hidapi. Return the device or None."""
    devs = hid_mod.enumerate(VID, PID)
    print(f"[hid] enumerate({VID:#06x}, {PID:#06x}) -> {len(devs)} device(s)")
    if not devs:
        print("[hid] no Axon dongle found on the HID bus")
        return None
    # pick the first one
    path = devs[0]["path"]
    print(f"[hid] opening path {path!r}")
    dev = hid_mod.device()
    dev.open_path(path)
    try:
        dev.set_nonblocking(0)  # blocking reads with explicit timeout
    except Exception as e:
        print(f"[hid] set_nonblocking failed (non-fatal): {e}")
    return dev


def do_write(dev, payload: list[int], label: str) -> int:
    """Try writing a 64-byte payload; fall back to 65-byte w/ leading 0."""
    try:
        n = dev.write(payload)
        if n > 0:
            return n
        print(f"[hid] {label}: 64-byte write returned {n}, trying 65-byte framing")
    except Exception as e:
        print(f"[hid] {label}: 64-byte write raised {e}, trying 65-byte framing")
    n = dev.write([0x00] + payload)
    return n


def do_identify(dev) -> bytes | None:
    payload = build_payload(0x8A, 0x00, 0x04)
    n = do_write(dev, payload, "identify")
    if n <= 0:
        print(f"[hid] identify write failed: n={n}")
        return None
    rx = dev.read(REPORT_SIZE, timeout_ms=500)
    if not rx:
        return None
    return bytes(rx)


def do_read_chunk(dev, addr: int, length: int) -> bytes | None:
    payload = build_payload(0xCD, addr, length)
    n = do_write(dev, payload, f"read addr={addr:#04x} len={length:#04x}")
    if n <= 0:
        print(f"[hid] read write failed: n={n}")
        return None
    # Wait for the wire transaction to complete (~68 ms at 9600 baud)
    time.sleep(0.08)
    rx = dev.read(REPORT_SIZE, timeout_ms=500)
    if not rx:
        return None
    return bytes(rx)


def main() -> int:
    try:
        import hid  # type: ignore
    except ImportError:
        sys.stderr.write(
            "hidapi not installed:\n"
            "  source ~/tools/axon-hw-venv/bin/activate\n"
            "  pip install hidapi\n"
        )
        return 2

    dev = try_open(hid)
    if dev is None:
        return 1

    try:
        # --- Phase 1: identify x3 ----------------------------------------
        print()
        print("=== identify x3 @ 300 ms ===")
        present_count = 0
        for i in range(3):
            rx = do_identify(dev)
            if rx is None:
                print(f"  poll {i+1}: (no reply)")
            else:
                tag = "PRESENT" if is_present(rx) else f"rx[2]={rx[2]:#04x}"
                print(f"  poll {i+1}: {tag}  rx[:8]={rx[:8].hex()}")
                if is_present(rx):
                    present_count += 1
            time.sleep(0.3)

        if present_count == 0:
            print()
            print("=> hidapi could not get a PRESENT reply.")
            print("   Either the dongle is cold (replug the servo) or")
            print("   hidapi fundamentally doesn't work with this device.")
            return 1

        # --- Phase 2: read chunk 0 --------------------------------------
        print()
        print("=== read chunk 0 (0xCD addr=0 len=0x3B) ===")
        rx0 = do_read_chunk(dev, 0x00, 0x3B)
        if rx0 is None:
            print("  read returned nothing")
            return 1
        print("  got 64 bytes:")
        print(hexdump(rx0))

        # The reply format (see docs/FINDINGS.md): rx[0]=report id (0x04
        # on libusb; hidapi may strip this), rx[1]=01 OK, rx[2]=00 OK,
        # rx[3]=addr echo, rx[4]=length echo, rx[5..5+N]=data.
        #
        # hidapi on some platforms strips the report ID from the read
        # buffer, so we try BOTH offsets.
        candidates = [
            ("with report-id prefix", rx0, 5),
            ("no report-id prefix",   rx0, 4),
        ]
        best = None
        for tag, buf, off in candidates:
            if len(buf) < off + 59:
                continue
            data = buf[off:off + 59]
            hits = sum(1 for i in range(59) if data[i] == EXPECTED_CHUNK0[i])
            print(f"  [{tag}] offset={off}: {hits}/59 bytes match")
            if best is None or hits > best[0]:
                best = (hits, tag, data)

        if best is None:
            print("  no valid offset")
            return 1

        hits, tag, data = best
        if hits == 59:
            print()
            print(f"=> PASS: hidapi identified the device and read chunk 0 "
                  f"correctly ({tag}).")
            print("   We can drop libusb + sudo from the Axon CLI and use")
            print("   hidapi instead. node-hid (Bun-compatible) should work")
            print("   the same way.")
            return 0
        elif hits >= 30:
            print()
            print(f"=> PARTIAL: {hits}/59 bytes match ({tag}). The data is")
            print(f"   there but the framing/offset is different than we")
            print(f"   think. Inspect the hexdump above.")
            return 1
        else:
            print()
            print(f"=> FAIL: only {hits}/59 bytes match. hidapi read returned")
            print(f"   something but it's not the config block.")
            return 1

    finally:
        dev.close()


if __name__ == "__main__":
    sys.exit(main())
