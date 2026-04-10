#!/usr/bin/env python3
"""
Dual capture: drive the Axon dongle with libusb while the Saleae
Logic 2 simultaneously captures the 1-wire servo bus via its
Python automation API. Every HID transaction lines up with the
exact wire bytes (or absence thereof) that resulted.

This tool exists because the HID-side reply for `0xCD` has turned
out to NOT be a transparent copy of the wire reply — it is a
curated 64-byte "device status struct" that the dongle serves
from an internal cache. The only way to know whether our libusb
`0xCD` command actually triggers a wire-level read transaction
(or whether the dongle silently swallows it because we haven't
replayed the exe's arming sequence) is to watch the wire while
we do it.

What this script does, in order:

  1. Connect to Logic 2's automation server on 127.0.0.1:10430.
  2. Start a timed capture on Channel 0 with an Async Serial
     analyzer (9600 baud, 8N1) — this mirrors the user's working
     manual setup.
  3. Open the dongle and issue a **USB bus reset** (equivalent to
     a physical replug — the user confirmed that "jiggling the
     device handle in Parallels" primes the dongle, and that
     jiggle is just a USB reset).
  4. Claim interface 0, drain any pending reports.
  5. Issue one identify (`0x8A`) and verify PRESENT.
  6. Issue one read chunk 0 (`0xCD`, addr=0, len=0x3B).
  7. Read the HID IN endpoint once (with 500 ms timeout).
  8. Release the interface, stop the Saleae capture, export the
     decoded async-serial table as CSV.
  9. Re-parse that CSV with the in-process frame decoder and
     print a side-by-side summary: what we sent over HID, what
     the dongle put on the wire (if anything), what the servo
     replied with on the wire, and what the dongle returned on
     HID IN.

Two named filepaths are written under samples/saleae/:

    - dual_capture_<timestamp>.sal    Saleae binary session
    - dual_capture_<timestamp>.csv    Async Serial decoded table

The CSV can be re-decoded any time with:

    tools/decode_saleae_csv.py samples/saleae/dual_capture_*.csv

Run:
    sudo /Users/caryden/tools/axon-hw-venv/bin/python3 \\
         /Users/caryden/github/servo-programmer/tools/axon_libusb_dual_capture.py
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime
from pathlib import Path

VID = 0x0471
PID = 0x13AA
EP_OUT = 0x01
EP_IN  = 0x81
REPORT_SIZE = 64

REPO_ROOT = Path(__file__).resolve().parent.parent
CAPTURE_DIR = REPO_ROOT / "samples" / "saleae"
CAPTURE_DIR.mkdir(parents=True, exist_ok=True)

# Saleae setup — matches the manual capture the user already validated.
SALEAE_CHANNEL = 0          # signal wire
SALEAE_SAMPLE_RATE = 4_000_000  # 4 MHz digital — >>> Nyquist for 9600 baud
SALEAE_THRESHOLD_V = 1.2    # TTL-ish
BAUD = 9600


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


# ------------------------------------------------------------------------------
# Saleae side
# ------------------------------------------------------------------------------

def start_saleae():
    from saleae import automation
    print("[saleae] connecting to automation server on 127.0.0.1:10430", flush=True)
    manager = automation.Manager.connect(port=10430)

    device_cfg = automation.LogicDeviceConfiguration(
        enabled_digital_channels=[SALEAE_CHANNEL],
        digital_sample_rate=SALEAE_SAMPLE_RATE,
    )
    # Manual capture: we start it, run our libusb sequence, then stop it.
    capture_cfg = automation.CaptureConfiguration(
        capture_mode=automation.ManualCaptureMode(),
    )
    print("[saleae] starting capture", flush=True)
    capture = manager.start_capture(
        device_configuration=device_cfg,
        capture_configuration=capture_cfg,
    )
    # If anything below fails we MUST stop the capture, otherwise the next
    # script invocation hits "Cannot switch sessions while recording".
    try:
        print("[saleae] adding Async Serial analyzer @ 9600 baud, ch0",
              flush=True)
        analyzer = capture.add_analyzer(
            "Async Serial",
            settings={
                "Input Channel": SALEAE_CHANNEL,
                "Bit Rate (Bits/s)": BAUD,
                "Bits per Frame": 8,
                "Stop Bits": "1 Stop Bit (Standard)",
                "Parity Bit": "No Parity Bit (Standard)",
                "Significant Bit": "Least Significant Bit Sent First (Standard)",
                "Signal inversion": "Non Inverted (Standard)",
                "Mode": "Normal",
            },
        )
    except Exception:
        print("[saleae] add_analyzer failed — stopping orphan capture",
              flush=True)
        try:
            capture.stop()
        except Exception:
            pass
        try:
            capture.close()
        except Exception:
            pass
        raise
    return manager, capture, analyzer


def stop_and_export_saleae(manager, capture, analyzer, tag: str):
    from saleae import automation
    print("[saleae] stopping capture", flush=True)
    capture.stop()

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = CAPTURE_DIR / f"dual_capture_{tag}_{ts}"
    sal_path = str(base) + ".sal"
    csv_path = str(base) + ".csv"

    print(f"[saleae] saving .sal to {sal_path}", flush=True)
    capture.save_capture(filepath=sal_path)

    print(f"[saleae] exporting data table to {csv_path}", flush=True)
    capture.export_data_table(
        filepath=csv_path,
        analyzers=[analyzer],
    )

    capture.close()
    # manager is closed via its gRPC channel when the process exits
    return csv_path, sal_path


# ------------------------------------------------------------------------------
# libusb side — with USB reset to prime the dongle
# ------------------------------------------------------------------------------

def drive_dongle():
    """Return a list of (label, tx_or_None, rx_or_exception) tuples."""
    import usb.core, usb.util

    events: list[tuple[str, bytes | None, bytes | Exception]] = []

    print("[usb] find device", flush=True)
    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        raise RuntimeError("dongle not found")

    try:
        if dev.is_kernel_driver_active(0):
            print("[usb] detaching kernel driver", flush=True)
            dev.detach_kernel_driver(0)
    except Exception as e:
        print(f"[usb] detach_kernel_driver: {e}", flush=True)

    # NOTE: no USB bus reset. Our previous run proved that dev.reset()
    # puts the dongle into a cold "no servo" state that our HID
    # commands can't dig out of. The exe's prime sequence — whatever
    # it is — is in the exe's startup handshake, not in the USB
    # reset itself. For this test we assume the dongle is already
    # primed (either by a recent exe run in Parallels, or by the
    # previous successful libusb test).
    print("[usb] (skipping dev.reset — cold reset breaks the dongle)",
          flush=True)

    print("[usb] set_configuration + claim_interface(0)", flush=True)
    dev.set_configuration()
    usb.util.claim_interface(dev, 0)

    try:
        # Let the claim settle before we start hammering the wire
        time.sleep(0.05)

        # 1) identify baseline: poll at 300 ms cadence for up to 8 polls
        #    and record every reply. The exe does this constantly and we
        #    want to mirror its baseline state before issuing the read.
        print("[usb] -> identify baseline x8 @ 300 ms", flush=True)
        for i in range(8):
            tx_id = build_tx(0x8A, 0x00, 0x04)
            dev.write(EP_OUT, tx_id, timeout=500)
            try:
                rx_id = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
                events.append((f"identify_{i+1}", tx_id, rx_id))
                p = "PRESENT" if is_present(rx_id) else f"rx[2]={rx_id[2]:#04x}"
                print(f"[usb]    poll {i+1}: {p}", flush=True)
            except Exception as e:
                events.append((f"identify_{i+1}", tx_id, e))
                print(f"[usb]    poll {i+1}: {e}", flush=True)
            time.sleep(0.3)

        # Small pause before the read so the wire trace has a visible
        # gap between the keepalive train and the read transaction.
        time.sleep(0.1)

        # 2) read chunk 0 — the prize
        tx_rd = build_tx(0xCD, 0x00, 0x3B)
        print("[usb] -> read chunk 0 (0xCD addr=0 len=0x3B)", flush=True)
        dev.write(EP_OUT, tx_rd, timeout=500)
        # Give the wire transaction time to complete before we drain HID IN
        time.sleep(0.100)
        try:
            rx_rd = bytes(dev.read(EP_IN, REPORT_SIZE, timeout=500))
            events.append(("read_chunk0", tx_rd, rx_rd))
            print(f"[usb] <- read rx[:8]={rx_rd[:8].hex()}", flush=True)
        except Exception as e:
            events.append(("read_chunk0", tx_rd, e))
            print(f"[usb] read chunk 0 read failed: {e}", flush=True)

        # Tail pause so the wire capture has a little trailing silence.
        time.sleep(0.100)

    finally:
        try:
            usb.util.release_interface(dev, 0)
        except Exception:
            pass
        try:
            dev.attach_kernel_driver(0)
        except Exception:
            pass

    return events


# ------------------------------------------------------------------------------
# Wire decode (in-process, reuses tools/decode_saleae_csv.py)
# ------------------------------------------------------------------------------

def decode_wire_csv(csv_path: str) -> list[tuple[float, bytes, str]]:
    """Return [(start_s, raw_bytes, classification), ...] for each frame."""
    sys.path.insert(0, str(REPO_ROOT / "tools"))
    import decode_saleae_csv as dec  # type: ignore

    rows = dec.load_csv(Path(csv_path))
    frames = dec.group_frames(rows)
    out = []
    for f in frames:
        out.append((f.start_s, f.bytes, dec.classify(f)))
    return out


# ------------------------------------------------------------------------------
# Report
# ------------------------------------------------------------------------------

def print_report(events, wire_frames, csv_path):
    print()
    print("=" * 72)
    print("DUAL-CAPTURE REPORT")
    print("=" * 72)

    print()
    print(f"Wire capture saved to: {csv_path}")
    print(f"Total wire frames:     {len(wire_frames)}")
    print()
    print("--- wire frames ---")
    for t, raw, cls in wire_frames:
        print(f"  t={t:+10.6f}s  len={len(raw):3d}  {cls}")
        print(f"    {raw.hex(' ')}")

    print()
    print("--- libusb HID transactions ---")
    for label, tx, rx in events:
        print()
        print(f"  [{label}]")
        print(f"  tx ({len(tx) if tx else 0} bytes):")
        if tx:
            print(hexdump(tx, indent="      "))
        print(f"  rx:")
        if isinstance(rx, Exception):
            print(f"      EXCEPTION: {rx}")
        else:
            print(hexdump(rx, indent="      "))

    print()
    print("--- interpretation ---")
    # Count read-related wire frames
    read_host_frames = [
        (t, raw) for t, raw, cls in wire_frames if "read" in cls and "HOST" in cls
    ]
    read_servo_replies = [
        (t, raw) for t, raw, cls in wire_frames
        if "SERVO" in cls and len(raw) > 20  # heuristic for a large reply
    ]
    if read_host_frames:
        print(f"  * Dongle emitted {len(read_host_frames)} 0xCD frame(s) on "
              f"the wire in response to our HID 0xCD.")
        print(f"    First: {read_host_frames[0][1].hex(' ')}")
        if read_servo_replies:
            print(f"  * Servo responded with {len(read_servo_replies)} large "
                  f"reply frame(s).")
            print(f"    First ({len(read_servo_replies[0][1])} bytes): "
                  f"{read_servo_replies[0][1].hex(' ')}")
            print("  => The dongle IS a transparent proxy on the wire for "
                  "reads. The HID reply not matching the wire must be due "
                  "to internal caching/transformation at the dongle's HID "
                  "side.")
        else:
            print("  * But no large servo reply was captured. Either the "
                  "servo isn't primed, or the reply arrived outside the "
                  "capture window.")
    else:
        print("  * Dongle did NOT emit any 0xCD frame on the wire.")
        print("  => Our HID 0xCD is being swallowed. The exe must do "
              "something extra (an 'arm' command) before read that we "
              "aren't replaying.")


def main() -> int:
    try:
        import saleae.automation  # noqa: F401
    except ImportError:
        sys.stderr.write("logic2-automation not installed in this venv\n")
        return 2
    try:
        import usb.core  # noqa: F401
    except ImportError:
        sys.stderr.write("pyusb not installed\n")
        return 2

    # Start the Saleae capture first so it's already recording when libusb
    # starts issuing transactions.
    try:
        manager, capture, analyzer = start_saleae()
    except Exception as e:
        sys.stderr.write(f"failed to start Saleae capture: {e}\n")
        sys.stderr.write("Is Logic 2 running with the automation server "
                         "enabled on port 10430?\n")
        return 1
    # Give the capture a brief head-start so the first wire byte falls
    # comfortably inside the capture window.
    time.sleep(0.2)

    events = []
    try:
        events = drive_dongle()
    except Exception as e:
        print(f"\n[usb] FATAL: {e}", flush=True)
    finally:
        try:
            csv_path, sal_path = stop_and_export_saleae(
                manager, capture, analyzer, tag="read_probe")
        except Exception as e:
            sys.stderr.write(f"failed to stop/export Saleae capture: {e}\n")
            return 1

    try:
        wire_frames = decode_wire_csv(csv_path)
    except Exception as e:
        sys.stderr.write(f"failed to decode wire CSV: {e}\n")
        wire_frames = []

    print_report(events, wire_frames, csv_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
