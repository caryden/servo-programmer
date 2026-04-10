#!/usr/bin/env python3
"""
Standalone test that uses libusb (via pyusb) instead of hidapi to talk to
the Axon dongle. The point of using libusb is that we can issue raw
control transfers, including HID class requests like Set_Idle, which
hidapi doesn't expose.

The vendor ETW trace showed the .exe issues exactly one Set_Idle
(bRequest=0x0A, bmRequestType=0x21, wValue=0x0000, wIndex=0x0000,
wLength=0) at startup. macOS hidapi may or may not send this on
IOHIDDeviceOpen — this script is the easiest way to test "send Set_Idle
ourselves and see if behaviour changes".

The script:
  1. Detaches any kernel HID driver from the dongle
  2. Claims interface 0
  3. Sends Set_Idle (HID class request, infinite duration, all reports)
  4. Sends identify (cmd 0x8A) over interrupt OUT endpoint 0x01
  5. Reads the reply from interrupt IN endpoint 0x81
  6. Repeats identify a few times to see if rx[2] is stable at 0x00
  7. If we get a stable PRESENT, tries the read-block (0xCD) burst
     interleaved with identifies (matching the exe's pattern)
  8. Releases the interface and reattaches the kernel driver

NOTE: Requires the dongle to NOT be owned by Parallels — make sure
prlsrvctl usb set ... --autoconnect host has been run, or detach via
the Parallels Devices menu.

NOTE: pyusb on macOS uses libusb. The first time you run a script that
opens a USB device, macOS may show an "allow USB access" dialog or
require sudo. If you get a permission error, try running with sudo.
"""

from __future__ import annotations

import sys
import time

VID = 0x0471
PID = 0x13AA
EP_OUT = 0x01     # interrupt OUT (host -> device)
EP_IN  = 0x81     # interrupt IN  (device -> host)
REPORT_SIZE = 64  # HID report size on the wire (excluding the report-ID byte
                  # which is sent inline as the first data byte for HID, but
                  # for raw libusb interrupt-OUT we just send the full 64 B)


def hexdump(data: bytes, width: int = 16) -> str:
    out = []
    for off in range(0, len(data), width):
        chunk = data[off:off + width]
        h = " ".join(f"{b:02x}" for b in chunk)
        a = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        out.append(f"  {off:04x}  {h:<{width*3-1}s}  {a}")
    return "\n".join(out)


def send_identify(dev) -> bytes:
    """Send 04 8A 00 00 04 ... over interrupt OUT and read the reply."""
    tx = bytes([0x04, 0x8A, 0x00, 0x00, 0x04]) + b"\x00" * (REPORT_SIZE - 5)
    n = dev.write(EP_OUT, tx, timeout=500)
    if n != REPORT_SIZE:
        raise IOError(f"identify write returned {n}")
    rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
    return rx


def send_read_chunk(dev, addr: int, length: int) -> bytes:
    """Send 04 CD addr_hi addr_lo length ... and read the reply."""
    tx = bytes([0x04, 0xCD, (addr >> 8) & 0xff, addr & 0xff, length]) \
        + b"\x00" * (REPORT_SIZE - 5)
    n = dev.write(EP_OUT, tx, timeout=500)
    if n != REPORT_SIZE:
        raise IOError(f"read-chunk write returned {n}")
    rx = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
    return rx


def is_present(rx: bytes) -> bool:
    return (rx[1] == 0x01 and rx[2] == 0x00 and
            rx[5] in (0x03, 0x04) and rx[7] == 0x01)


def main() -> int:
    try:
        import usb.core, usb.util
    except ImportError:
        sys.stderr.write("pyusb not installed.\n"
                         "  ~/tools/axon-hw-venv/bin/pip install pyusb\n")
        return 2

    print("=== Phase 0: Find and claim the dongle via libusb ===")
    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        sys.stderr.write(
            f"Dongle (VID {VID:#06x} PID {PID:#06x}) not found.\n"
            "Is it plugged in? Is Parallels holding it?\n"
        )
        return 1
    print(f"  found: {dev.manufacturer!r} {dev.product!r}")

    # On macOS, IOKit's HIDDevice driver claims interface 0 of any HID
    # device. We need to detach it before we can claim it ourselves.
    try:
        if dev.is_kernel_driver_active(0):
            print("  detaching kernel HID driver from interface 0")
            dev.detach_kernel_driver(0)
        else:
            print("  no kernel driver on interface 0 (good)")
    except (NotImplementedError, usb.core.USBError) as e:
        # On macOS, libusb may not implement is_kernel_driver_active reliably
        # but the open below will still work if we have permissions.
        print(f"  (kernel driver check raised {e!r}, continuing)")

    interface_claimed = False
    try:
        dev.set_configuration()
        usb.util.claim_interface(dev, 0)
        interface_claimed = True
        print("  configuration set, interface 0 claimed")
    except usb.core.USBError as e:
        print(f"  could not claim interface 0 ({e})")
        print("  continuing without claim — control transfers may still work")
        print("  (interrupt OUT/IN reads will fail without claim)")

    try:
        # ----- Phase 1: Set_Idle (the .exe sends this on startup) ----------
        print()
        print("=== Phase 1: Send HID Set_Idle (the .exe sends this on startup) ===")
        # bmRequestType = 0x21 = host->device, type=class, recipient=interface
        # bRequest      = 0x0A = SET_IDLE
        # wValue        = 0x0000 = duration_high<<8 | report_id  (infinite, all)
        # wIndex        = 0x0000 = interface number
        # wLength       = 0     = no data
        try:
            dev.ctrl_transfer(
                bmRequestType=0x21,
                bRequest=0x0A,
                wValue=0x0000,
                wIndex=0x0000,
                data_or_wLength=0,
                timeout=500,
            )
            print("  Set_Idle: OK")
        except usb.core.USBError as e:
            print(f"  Set_Idle FAILED: {e}")

        # If we couldn't claim the interface, we can't do interrupt OUT/IN.
        # Stop here after the Set_Idle test — the value of just sending
        # Set_Idle is that we know whether macOS lets us do it at all.
        if not interface_claimed:
            print()
            print("(interface not claimed — skipping identify/read tests)")
            print("If Set_Idle succeeded above, we know macOS allows the "
                  "control transfer; if it failed, we have a permissions "
                  "issue and need to run with sudo.")
            return 0

        # ----- Phase 2: identify polling -----------------------------------
        print()
        print("=== Phase 2: poll identify (300 ms cadence, max 30 polls) ===")
        present_rx: bytes | None = None
        for poll in range(30):
            try:
                rx = send_identify(dev)
            except Exception as e:
                print(f"  poll #{poll+1}: FAILED {e}")
                time.sleep(0.3)
                continue
            tag = "PRESENT" if is_present(rx) else f"absent rx[2]={rx[2]:#04x}"
            print(f"  poll #{poll+1:3d}: {tag:18s}  rx[1..8]={rx[1:8].hex()}")
            if is_present(rx):
                present_rx = rx
                # Don't break — keep polling to see if it stays PRESENT
                # for a few polls in a row
                if poll >= 3:
                    break
            time.sleep(0.3)

        if present_rx is None:
            print()
            print("PRESENT never detected.")
            print("Try: physically unplug and re-plug the SERVO from the dongle,")
            print("then re-run this script.")
            return 1

        # ----- Phase 3: interleaved read burst (mimics .exe ETW pattern) ---
        print()
        print("=== Phase 3: interleaved read burst (id, rd0, id, rd1, id) ===")
        config_block = bytearray()
        success = True

        for label, fn in [
            ("id (1)", lambda: send_identify(dev)),
            ("rd  0", lambda: send_read_chunk(dev, addr=0, length=0x3B)),
            ("id (2)", lambda: send_identify(dev)),
            ("rd  1", lambda: send_read_chunk(dev, addr=0x3B, length=0x24)),
            ("id (3)", lambda: send_identify(dev)),
        ]:
            try:
                rx = fn()
            except Exception as e:
                print(f"  {label}: FAILED {e}")
                success = False
                continue

            print(f"  {label}: rx[0..16]={rx[:16].hex()}  "
                  f"rx[1]={rx[1]:#04x} rx[2]={rx[2]:#04x}")

            if label.startswith("rd"):
                if rx[1] == 0x00 or rx[2] != 0x00:
                    print(f"     !! read failed (rx[1..2]={rx[1]:#04x},{rx[2]:#04x})")
                    success = False
                else:
                    chunk_len = 0x3B if "0" in label else 0x24
                    config_block.extend(rx[5:5 + chunk_len])
                    print(f"     OK ({chunk_len} bytes)")

        # ----- Phase 4: report ---------------------------------------------
        print()
        if success and len(config_block) == 0x5F:
            print(f"=== TEST PASSED — got {len(config_block)} bytes ===")
            print()
            print(hexdump(bytes(config_block)))
            import os
            out_dir = os.path.expanduser(
                "~/github/servo-programmer/samples/runtime")
            os.makedirs(out_dir, exist_ok=True)
            out_path = os.path.join(
                out_dir, f"libusb_read_{int(time.time())}.bin")
            with open(out_path, "wb") as f:
                f.write(bytes(config_block))
            print(f"\nsaved to {out_path}")
            # compare to mini.svo
            try:
                svo = open(os.path.expanduser(
                    "~/github/servo-programmer/samples/mini.svo"), "rb").read()
                if svo == bytes(config_block):
                    print("MATCHES samples/mini.svo byte-for-byte ✓")
                else:
                    diffs = sum(1 for a, b in zip(svo, config_block) if a != b)
                    print(f"differs from samples/mini.svo: {diffs}/{len(svo)} bytes")
            except FileNotFoundError:
                pass
        else:
            print(f"=== TEST FAILED ({len(config_block)} bytes read) ===")
            if config_block:
                print(hexdump(bytes(config_block)))

    finally:
        # ----- Cleanup -----------------------------------------------------
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
