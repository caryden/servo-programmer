#!/usr/bin/env python3
"""
Half-automated dual-capture harness.

You drive the Saleae manually — start the capture in Logic 2's GUI
when the script prompts you, stop it when the script finishes — and
this script drives the libusb side: it waits for the dongle to be
in the "servo present" state, prompts you to start the capture,
runs one fixed sequence of HID commands, prints what came back,
and prompts you to stop + save the capture.

Fixed sequence (read-only, no writes):
  1. 3 identify polls (confirm PRESENT)
  2. Short pause
  3. Read chunk 0:  0xCD addr=0x00 len=0x3B
  4. Short pause
  5. Read chunk 1:  0xCD addr=0x3B len=0x24
  6. Short pause
  7. 2 more identify polls (confirm PRESENT still)

By running this under the Saleae at the same time, we get a
byte-for-byte comparison of what libusb sent/received vs what
actually went out on the 1-wire bus.

Safe to run:
  - No writes to the servo.
  - No USB bus reset (preserves the dongle's "primed" state).
  - If the dongle is cold, we print instructions for the user to
    replug the servo rather than trying to reset anything.

Run:
    sudo /Users/caryden/tools/axon-hw-venv/bin/python3 \\
         /Users/caryden/github/servo-programmer/tools/axon_libusb_test7.py
"""

from __future__ import annotations

import sys
import time
from datetime import datetime

VID = 0x0471
PID = 0x13AA
EP_OUT = 0x01
EP_IN  = 0x81
REPORT_SIZE = 64


def build_tx(cmd: int, addr: int, chunk_len: int) -> bytes:
    tx = bytearray(REPORT_SIZE)
    tx[0] = 0x04
    tx[1] = cmd
    tx[2] = (addr >> 8) & 0xff
    tx[3] = addr & 0xff
    tx[4] = chunk_len
    return bytes(tx)


def hexdump(buf: bytes, *, indent: str = "      ") -> str:
    lines: list[str] = []
    for off in range(0, len(buf), 16):
        chunk = buf[off:off + 16]
        h = " ".join(f"{b:02x}" for b in chunk)
        a = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        lines.append(f"{indent}0x{off:02x}  {h:<47s}  {a}")
    return "\n".join(lines)


def is_present(rx: bytes) -> bool:
    return (len(rx) >= 8 and rx[1] == 0x01 and rx[2] == 0x00 and
            rx[5] in (0x03, 0x04) and rx[7] == 0x01)


def stamp() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def wait_for_present(dev, max_secs: float = 30.0) -> bool:
    """Poll identify at 300 ms cadence until PRESENT or timeout."""
    print("waiting for SERVO PRESENT "
          "(unplug + replug the servo if this hangs)...")
    deadline = time.monotonic() + max_secs
    while time.monotonic() < deadline:
        try:
            dev.write(EP_OUT, build_tx(0x8A, 0x00, 0x04), timeout=500)
            rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
            if is_present(rx):
                print(f"  [{stamp()}] PRESENT")
                return True
            print(f"  [{stamp()}] rx[2]={rx[2]:#04x}  (not present yet)")
        except Exception as e:
            print(f"  [{stamp()}] poll exception: {e}")
        time.sleep(0.3)
    print("  timed out waiting for PRESENT.")
    return False


def prompt(msg: str) -> None:
    """Block until the user presses Enter."""
    try:
        input(msg)
    except EOFError:
        # stdin closed (e.g. background run) — just continue
        print()


def do_identify(dev, label: str) -> bytes | None:
    try:
        dev.write(EP_OUT, build_tx(0x8A, 0x00, 0x04), timeout=500)
        rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
        p = "PRESENT" if is_present(rx) else f"rx[2]={rx[2]:#04x}"
        print(f"  [{stamp()}] {label}  {p}")
        return rx
    except Exception as e:
        print(f"  [{stamp()}] {label}  EXCEPTION {e}")
        return None


def do_read(dev, label: str, addr: int, length: int) -> bytes | None:
    try:
        dev.write(EP_OUT, build_tx(0xCD, addr, length), timeout=500)
        # Wait long enough for a 65-byte wire reply at 9600 baud
        # (~68 ms) plus overhead
        time.sleep(0.10)
        rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
        print(f"  [{stamp()}] {label}  "
              f"rx[1..4]={rx[1:4].hex()}  rx[4]={rx[4]:#04x}")
        return rx
    except Exception as e:
        print(f"  [{stamp()}] {label}  EXCEPTION {e}")
        return None


def run_sequence(dev, captured: dict) -> None:
    print()
    print("--- libusb sequence ---")
    print("  identify x3:")
    for i in range(3):
        rx = do_identify(dev, f"id-baseline-{i+1}")
        captured[f"id-baseline-{i+1}"] = rx
        time.sleep(0.3)

    time.sleep(0.2)
    print("  read chunk 0 (addr=0x00 len=0x3B):")
    rx = do_read(dev, "read-chunk0", 0x00, 0x3B)
    captured["read-chunk0"] = rx

    time.sleep(0.2)
    print("  read chunk 1 (addr=0x3B len=0x24):")
    rx = do_read(dev, "read-chunk1", 0x3B, 0x24)
    captured["read-chunk1"] = rx

    time.sleep(0.2)
    print("  identify x2 (post-read sanity):")
    for i in range(2):
        rx = do_identify(dev, f"id-post-{i+1}")
        captured[f"id-post-{i+1}"] = rx
        time.sleep(0.3)


def print_report(captured: dict) -> None:
    print()
    print("--- HID transactions summary ---")
    for label, rx in captured.items():
        print()
        print(f"  [{label}]")
        if rx is None:
            print("    (no reply)")
            continue
        print(hexdump(rx))


def main() -> int:
    try:
        import usb.core, usb.util
    except ImportError:
        sys.stderr.write("pyusb not installed in this venv\n")
        return 2

    print("=" * 72)
    print("Axon dual-capture harness (manual Saleae)")
    print("=" * 72)
    print()
    print("Workflow:")
    print("  1. Script finds the dongle and waits for SERVO PRESENT.")
    print("  2. Script prompts you to start the Saleae capture in")
    print("     Logic 2's GUI. Press Enter when you have clicked Start.")
    print("  3. Script runs a fixed read-only sequence.")
    print("  4. Script prompts you to stop + save the Saleae capture.")
    print("     Save the decoded Async Serial table as")
    print("     samples/saleae/dual_test7_<tag>.csv")
    print()

    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        print("DONGLE NOT FOUND. Plug in the adapter and retry.")
        return 1
    print(f"found dongle: {dev.manufacturer!r} {dev.product!r}")

    try:
        if dev.is_kernel_driver_active(0):
            dev.detach_kernel_driver(0)
    except Exception:
        pass
    try:
        dev.set_configuration()
        usb.util.claim_interface(dev, 0)
    except usb.core.USBError as e:
        print(f"could not claim interface: {e}")
        print("(needs sudo on macOS, AND make sure Parallels is not "
              "holding the device)")
        return 1

    captured: dict = {}
    try:
        if not wait_for_present(dev):
            print()
            print("giving up — servo never reported PRESENT.")
            print("Unplug the servo, make sure the adapter is still")
            print("connected, then plug the servo back in. Then retry.")
            return 1

        print()
        prompt(">>> Start the Saleae capture in Logic 2 now, "
               "then press Enter to run the read sequence <<<")

        # Small grace period so the first byte of the sequence lands
        # comfortably inside the capture window
        time.sleep(0.3)

        run_sequence(dev, captured)

        print()
        print(">>> Sequence done. Stop the Saleae capture now.")
        print("    Save the decoded Async Serial CSV as:")
        print("      samples/saleae/dual_test7_<your_tag>.csv")
        prompt("    Press Enter when the CSV is saved <<<")

        print_report(captured)
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
