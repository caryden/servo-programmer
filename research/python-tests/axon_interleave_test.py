#!/usr/bin/env python3
"""
Standalone test of the "interleaved identify keepalive" hypothesis.

The vendor exe's USB ETW trace shows that during the "Read parameters"
button click, every cmd 0xCD chunk is sandwiched between identify (0x8A)
polls. The hypothesis is that the dongle's wire-side state machine
requires a continuous identify keepalive to stay in the read-ready state,
and reads sent in isolation push it out of that state (which is what we
were doing — explaining the rx[2]=0x02 errors we hit).

This test mimics the exe's burst pattern exactly:

    identify  →  read-chunk-0  →  identify  →  read-chunk-1  →  identify

All from a single thread, no background polling. Read-only — sends only
0x8A (identify) and 0xCD (read config block). Will not write anything to
the servo's flash.

Run:
    ~/tools/axon-hw-venv/bin/python3 tools/axon_interleave_test.py

The script first polls identify until PRESENT is detected. To get to
PRESENT you may need to physically unplug and re-plug the servo into the
dongle (the "electrical edge" detection mechanism we figured out earlier).
"""

from __future__ import annotations

import os
import sys
import time

VID = 0x0471
PID = 0x13AA
REPORT_SIZE = 64

# 95-byte config block split as 59 + 36 bytes — same as FUN_004047d0 does
CONFIG_BLOCK_LEN = 0x5F
CHUNK_0_LEN = 0x3B  # 59 bytes
CHUNK_1_LEN = 0x24  # 36 bytes


def send(dev, label: str, tx_bytes: list, *, verbose: bool = True) -> bytes:
    """Write a 64-byte HID output report and read the 64-byte reply."""
    tx = bytes(tx_bytes) + b"\x00" * (REPORT_SIZE - len(tx_bytes))
    dev.write(list(tx))
    rx = bytes(dev.read(REPORT_SIZE, timeout_ms=500) or [])
    if verbose:
        print(
            f"  {label:>8s}  rx[0..16]={rx[:16].hex()}  "
            f"rx[1]={rx[1]:#04x} rx[2]={rx[2]:#04x}"
        )
    return rx


def is_present(rx: bytes) -> bool:
    return (rx[1] == 0x01 and rx[2] == 0x00 and
            rx[5] in (0x03, 0x04) and rx[7] == 0x01)


def parse_present(rx: bytes) -> str:
    name_raw = rx[8:16]
    name = name_raw.replace(b"*", b" ").decode("ascii", "replace").rstrip()
    return (f"model_byte=0x{rx[5]:02x} mode_byte=0x{rx[7]:02x} "
            f"name={name!r}")


def main() -> int:
    try:
        import hid  # type: ignore
    except ImportError:
        sys.stderr.write(
            "hidapi not installed.\n"
            "  ~/tools/axon-hw-venv/bin/pip install hidapi\n"
        )
        return 2

    dev = hid.device()
    try:
        dev.open(VID, PID)
    except Exception as exc:
        sys.stderr.write(f"could not open dongle: {exc}\n")
        sys.stderr.write(
            "is it plugged in? is Parallels (or another process) holding it?\n"
        )
        return 1
    print(f"opened {dev.get_product_string()!r}")

    # Drain any stale reports
    dev.set_nonblocking(True)
    drained = 0
    while True:
        r = dev.read(REPORT_SIZE)
        if not r:
            break
        drained += 1
    dev.set_nonblocking(False)
    if drained:
        print(f"drained {drained} stale reports")

    # ----- Phase 1: poll identify until PRESENT -------------------------------
    print()
    print("=== Phase 1: poll identify (300 ms) until PRESENT ===")
    print("If you don't see PRESENT within 5 seconds, physically unplug and")
    print("re-plug the SERVO from the dongle (NOT the dongle from USB).")
    print()

    present_rx: bytes | None = None
    deadline = time.monotonic() + 30  # 30-second timeout
    poll = 0
    while time.monotonic() < deadline:
        rx = send(dev, f"poll{poll:3d}", [0x04, 0x8A, 0x00, 0x00, 0x04],
                  verbose=False)
        poll += 1
        if is_present(rx):
            present_rx = rx
            print(f"  poll #{poll}: PRESENT — {parse_present(rx)}")
            break
        # Print only on first poll and every 5th to avoid spam
        if poll == 1 or poll % 5 == 0:
            print(
                f"  poll #{poll:3d}: rx[1..3]={rx[1:3].hex()} "
                f"(rx[2]=0x{rx[2]:02x})"
            )
        time.sleep(0.3)

    if present_rx is None:
        print()
        print("PRESENT never detected within 30 seconds.")
        print("Try physically unplugging and re-plugging the SERVO into the dongle,")
        print("then re-run this test.")
        dev.close()
        return 1

    # ----- Phase 2: interleaved read burst ------------------------------------
    print()
    print("=== Phase 2: interleaved read burst (mimics exe ETW trace) ===")
    print("Pattern: identify -> read chunk 0 -> identify -> read chunk 1 -> identify")
    print()

    config_block = bytearray()
    success = True

    # Step 1: identify (warm up)
    rx = send(dev, "id (1)", [0x04, 0x8A, 0x00, 0x00, 0x04])
    if not is_present(rx):
        print(f"  !! identify after PRESENT detection no longer reports present: rx[2]=0x{rx[2]:02x}")
        success = False

    # Step 2: read chunk 0 (addr=0, len=59)
    rx = send(dev, "rd 0", [0x04, 0xCD, 0x00, 0x00, CHUNK_0_LEN])
    if rx[1] == 0x00 or rx[2] != 0x00:
        print(f"  !! read chunk 0 FAILED: rx[1]=0x{rx[1]:02x} rx[2]=0x{rx[2]:02x}")
        success = False
    else:
        config_block.extend(rx[5:5 + CHUNK_0_LEN])
        print(f"     read chunk 0 OK ({CHUNK_0_LEN} bytes)")

    # Step 3: identify (keepalive between chunks)
    rx = send(dev, "id (2)", [0x04, 0x8A, 0x00, 0x00, 0x04])
    if not is_present(rx):
        print(f"  !! mid-burst identify lost present state: rx[2]=0x{rx[2]:02x}")

    # Step 4: read chunk 1 (addr=59, len=36)
    rx = send(dev, "rd 1",
              [0x04, 0xCD, (CHUNK_0_LEN >> 8) & 0xFF, CHUNK_0_LEN & 0xFF,
               CHUNK_1_LEN])
    if rx[1] == 0x00 or rx[2] != 0x00:
        print(f"  !! read chunk 1 FAILED: rx[1]=0x{rx[1]:02x} rx[2]=0x{rx[2]:02x}")
        success = False
    else:
        config_block.extend(rx[5:5 + CHUNK_1_LEN])
        print(f"     read chunk 1 OK ({CHUNK_1_LEN} bytes)")

    # Step 5: identify (post-burst, like the exe does)
    rx = send(dev, "id (3)", [0x04, 0x8A, 0x00, 0x00, 0x04])
    if is_present(rx):
        print("     post-burst identify still PRESENT — wire-side state survived")
    else:
        print(f"     post-burst identify rx[2]=0x{rx[2]:02x}  "
              f"(state changed after the read burst)")

    # ----- Phase 3: report ----------------------------------------------------
    print()
    if not success or len(config_block) != CONFIG_BLOCK_LEN:
        print(f"=== TEST FAILED ({len(config_block)} bytes read) ===")
        if config_block:
            print("partial bytes:")
            for off in range(0, len(config_block), 16):
                chunk = config_block[off:off + 16]
                ascii_repr = "".join(
                    chr(b) if 32 <= b < 127 else "." for b in chunk)
                print(f"  0x{off:02x}  {chunk.hex(' '):<48s}  {ascii_repr}")
        dev.close()
        return 1

    print(f"=== TEST PASSED — got the full {CONFIG_BLOCK_LEN}-byte config block ===")
    print()
    for off in range(0, len(config_block), 16):
        chunk = config_block[off:off + 16]
        ascii_repr = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        print(f"  0x{off:02x}  {chunk.hex(' '):<48s}  {ascii_repr}")

    # Save with a timestamp
    out_dir = os.path.expanduser("~/github/servo-programmer/samples/runtime")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"interleaved_read_{int(time.time())}.bin")
    with open(out_path, "wb") as f:
        f.write(config_block)
    print()
    print(f"saved to {out_path}")

    # Cross-check against the saved mini.svo
    svo_path = os.path.expanduser("~/github/servo-programmer/samples/mini.svo")
    if os.path.exists(svo_path):
        with open(svo_path, "rb") as f:
            svo = f.read()
        if svo == bytes(config_block):
            print("MATCHES samples/mini.svo byte-for-byte ✓")
        else:
            diffs = sum(1 for a, b in zip(svo, config_block) if a != b)
            print(f"differs from samples/mini.svo: {diffs}/{len(svo)} bytes differ")
            print("(this is fine if you've changed parameters since saving the .svo)")

    dev.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
