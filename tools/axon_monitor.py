#!/usr/bin/env python3
"""
Live monitor for the Axon servo programmer.

Polls the dongle's 0x8A identify command at the vendor exe's exact 300 ms
cadence (matching tmr1Timer in FUN_0040330c) and prints state transitions
with a timestamp. Mixes no other commands into the loop, so we see exactly
which hardware actions correspond to which dongle replies.

Runs forever until Ctrl-C. Re-attaches automatically if you unplug the
dongle and plug it back in.

Usage:
    # one-shot, with the venv prefix:
    ~/tools/axon-hw-venv/bin/python3 tools/axon_monitor.py

    # custom cadence (anything in seconds):
    ~/tools/axon-hw-venv/bin/python3 tools/axon_monitor.py --period 0.3

    # show every poll, not just transitions:
    ~/tools/axon-hw-venv/bin/python3 tools/axon_monitor.py --verbose

Notes:
- The default 300 ms matches the .exe's tmr1Timer interval. Faster polling
  may starve the dongle's wire-side PWM/UART multiplexer (PWM is 50 Hz =
  20 ms period; the .exe leaves ~14 PWM frames between identifies).
- The user-friendly state column maps rx[2] to a human label:
    PRESENT       rx[1]==0x01 rx[2]==0x00 rx[5] in {3,4} rx[7]==1
    no-servo      rx[2]==0x04 — long-term absent baseline
    no-reply      rx[2]==0x02 — command not acked by servo
    transitional  rx[2]==0xFA — recently lost / re-acquiring
    no-dongle     dongle is unplugged from USB or owned by another process
"""

from __future__ import annotations

import argparse
import errno
import sys
import time

VID, PID = 0x0471, 0x13AA
REPORT_ID = 0x04
IDENTIFY = bytes([REPORT_ID, 0x8A, 0x00, 0x00, 0x04]) + b"\x00" * 59

CMD_CONFIG_READ = 0xCD     # 95-byte parameter block read
CONFIG_BLOCK_LEN = 0x5F    # 95 bytes
MAX_CHUNK = 0x3B           # 59 bytes per HID report (matches FUN_004047d0)
INTER_CHUNK_SLEEP = 0.025  # 25 ms (matches Sleep(0x19) in FUN_004047d0)

# rx[2] error code lookup table — built from the static-RE and live tests.
RX2_NAMES = {
    0x00: "PRESENT",       # servo handshake OK
    0x02: "no-reply",      # command reached programmer, servo did not respond
    0x04: "no-servo",      # long-term absent, dongle's wire-side idle state
    0xFA: "transitional",  # just-detected-or-just-lost, intermediate
}


def fmt_state(rx: bytes, dongle_present: bool) -> str:
    if not dongle_present:
        return "no-dongle"
    if not rx:
        return "no-reply"
    rx2 = rx[2]
    if rx2 == 0x00 and rx[1] == 0x01 and rx[5] in (0x03, 0x04) and rx[7] == 0x01:
        return "PRESENT"
    return RX2_NAMES.get(rx2, f"rx2=0x{rx2:02x}")


def open_dongle():
    import hid  # type: ignore
    matches = [
        d for d in hid.enumerate()
        if d.get("vendor_id") == VID and d.get("product_id") == PID
    ]
    if not matches:
        return None
    dev = hid.device()
    try:
        dev.open_path(matches[0]["path"])
    except Exception:
        return None
    dev.set_nonblocking(False)
    return dev


def read_config_block(dev) -> tuple[bytes | None, str]:
    """Read the 95-byte servo config block via cmd 0xCD, chunked into two
    HID reports of 59+36 bytes. Returns (bytes_or_None, status_string).

    Mirrors FUN_004047d0 in the vendor exe exactly: same chunk sizes, same
    25 ms inter-chunk sleep, same rx[1]!=0 && rx[2]==0 success criterion,
    same data offset rx[5..].
    """
    chunks = [(0, MAX_CHUNK), (MAX_CHUNK, CONFIG_BLOCK_LEN - MAX_CHUNK)]
    out = bytearray()
    for chunk_idx, (addr, length) in enumerate(chunks):
        if chunk_idx > 0:
            time.sleep(INTER_CHUNK_SLEEP)
        tx = bytes([REPORT_ID, CMD_CONFIG_READ,
                    (addr >> 8) & 0xFF, addr & 0xFF, length]) + b"\x00" * 59
        try:
            dev.write(list(tx))
            rx_raw = dev.read(64, timeout_ms=500)
        except Exception as e:
            return None, f"chunk {chunk_idx} I/O failed: {e}"
        rx = bytes(rx_raw or [])
        if not rx:
            return None, f"chunk {chunk_idx}: timeout (no reply)"
        if rx[1] == 0 or rx[2] != 0:
            return None, (f"chunk {chunk_idx}: status not OK "
                          f"(rx[1]={rx[1]:#04x} rx[2]={rx[2]:#04x}, full={rx[:16].hex()})")
        out.extend(rx[5:5 + length])
    if len(out) != CONFIG_BLOCK_LEN:
        return None, f"got {len(out)} bytes, wanted {CONFIG_BLOCK_LEN}"
    return bytes(out), "OK"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument("--period", type=float, default=0.3,
                   help="polling interval in seconds (default 0.3 = matches the exe)")
    p.add_argument("--duration", type=float, default=0.0,
                   help="optional auto-exit after this many seconds (default 0 = forever)")
    p.add_argument("--verbose", action="store_true",
                   help="print every poll, not just transitions")
    p.add_argument("--read-on-present", action="store_true",
                   help="when state first becomes PRESENT, run cmd 0xCD to "
                        "read the 95-byte config block and print + save it. "
                        "Compared against samples/mini.svo if it exists.")
    args = p.parse_args(argv)

    print(f"polling identify every {int(args.period*1000)} ms — Ctrl-C to stop")
    print(f"this re-implements tmr1Timer / jv1Arrival / FUN_0040330c exactly")
    print()
    print(f"{'time':>7s}  {'#':>5s}  {'dongle':>6s}  {'state':>13s}  rx[1..8]               name")
    print("-" * 90)

    dev = None
    poll_count = 0
    prev_summary = None
    t0 = time.monotonic()
    last_open_attempt = 0.0

    try:
        while True:
            elapsed = time.monotonic() - t0
            if args.duration > 0 and elapsed >= args.duration:
                break

            # Maintain dongle open: re-attempt every 1 s if we lost it
            if dev is None and (elapsed - last_open_attempt) >= 1.0:
                dev = open_dongle()
                last_open_attempt = elapsed

            dongle_present = dev is not None
            rx = b""
            if dongle_present:
                try:
                    n = dev.write(list(IDENTIFY))
                    if n != len(IDENTIFY):
                        raise IOError(f"write returned {n}")
                    raw = dev.read(64, timeout_ms=300)
                    rx = bytes(raw or [])
                except Exception as e:
                    msg = str(e)
                    rx = b""
                    # If the dongle was unplugged or stolen, drop our handle
                    try:
                        dev.close()
                    except Exception:
                        pass
                    dev = None
                    state = "no-dongle"

            if dongle_present and rx:
                state = fmt_state(rx, True)
            elif dongle_present and not rx:
                state = "io-fail"
            else:
                state = "no-dongle"

            # Build a compact summary used for transition detection. Includes
            # the entire rx[1..8] window so we catch model/mode/name flips too.
            summary = (state, rx[1:8] if rx else b"", rx[8:16] if rx else b"")
            poll_count += 1

            if args.verbose or summary != prev_summary or poll_count == 1:
                ts = f"{elapsed:6.2f}s"
                rx18 = rx[1:8].hex() if rx else "--"
                name = ""
                if rx:
                    name = rx[8:16].replace(b"*", b" ").decode("ascii", "replace").rstrip()
                marker = ""
                fired_read = False
                if prev_summary is not None and summary != prev_summary:
                    if summary[0] == "PRESENT":
                        marker = "  >>> SERVO PLUG-IN! <<<"
                        if args.read_on_present:
                            fired_read = True
                    elif prev_summary[0] == "PRESENT":
                        marker = "  >>> SERVO REMOVE! <<<"
                    elif summary[0] == "no-dongle":
                        marker = "  >>> ADAPTER REMOVED <<<"
                    elif prev_summary[0] == "no-dongle":
                        marker = "  >>> ADAPTER PLUG-IN! <<<"
                dongle_str = "yes" if dongle_present else "no"
                print(f"{ts:>7s}  {poll_count:>5d}  {dongle_str:>6s}  {state:>13s}  {rx18:<22s} {name!r:<14s}{marker}")
                sys.stdout.flush()
                prev_summary = summary

                if fired_read and dev is not None:
                    print()
                    print("    >>> attempting cmd 0xCD config-block read (95 bytes) <<<")
                    sys.stdout.flush()
                    block, status = read_config_block(dev)
                    if block is None:
                        print(f"    READ FAILED: {status}")
                    else:
                        print(f"    READ OK ({len(block)} bytes)")
                        for off in range(0, len(block), 16):
                            chunk = block[off:off + 16]
                            ascii_repr = "".join(
                                chr(b) if 32 <= b < 127 else "." for b in chunk)
                            print(f"      0x{off:02x}  {chunk.hex(' '):<48s}  {ascii_repr}")
                        # Save it
                        import os
                        out_dir = os.path.expanduser(
                            "~/github/servo-programmer/samples/runtime")
                        os.makedirs(out_dir, exist_ok=True)
                        out_path = os.path.join(
                            out_dir, f"live_read_{int(time.time())}.bin")
                        with open(out_path, "wb") as f:
                            f.write(block)
                        print(f"    saved -> {out_path}")
                        # Compare to mini.svo if present
                        svo_path = os.path.expanduser(
                            "~/github/servo-programmer/samples/mini.svo")
                        if os.path.exists(svo_path):
                            with open(svo_path, "rb") as f:
                                svo = f.read()
                            if svo == block:
                                print(f"    matches samples/mini.svo byte-for-byte")
                            else:
                                diffs = sum(1 for a, b in zip(svo, block) if a != b)
                                print(f"    differs from samples/mini.svo "
                                      f"({diffs}/{len(svo)} bytes differ)")
                                # Show byte-level diff for the first few differences
                                shown = 0
                                for i, (a, b) in enumerate(zip(svo, block)):
                                    if a != b and shown < 12:
                                        print(f"      0x{i:02x}: svo=0x{a:02x}  live=0x{b:02x}")
                                        shown += 1
                    print()
                    sys.stdout.flush()

            # Sleep to next poll boundary; clamp to >=10ms
            next_at = (poll_count) * args.period
            sleep_for = max(0.01, next_at - (time.monotonic() - t0))
            time.sleep(sleep_for)
    except KeyboardInterrupt:
        print("\n^C — stopped")
    finally:
        if dev is not None:
            try:
                dev.close()
            except Exception:
                pass

    print(f"\ntotal polls: {poll_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
