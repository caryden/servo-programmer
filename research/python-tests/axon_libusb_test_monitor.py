#!/usr/bin/env python3
"""
Live presence monitor for the Axon servo programmer.

Polls every 300 ms (same cadence the vendor exe uses) and prints a
transition line whenever the adapter or servo presence state changes.
Runs until Ctrl-C.

This mirrors the exe's main-thread behavior: it holds the USB handle
open across polls, recovers if the dongle is physically unplugged,
and reports servo plug-in/plug-out events via the 0x8A identify
command.

Run:
    sudo /Users/caryden/tools/axon-hw-venv/bin/python3 \\
         /Users/caryden/github/servo-programmer/tools/axon_libusb_test_monitor.py

Press Ctrl-C to stop.
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
POLL_INTERVAL_S = 0.3

# State values
S_NO_ADAPTER    = "no-adapter"
S_ADAPTER_ONLY  = "adapter-only"      # dongle on USB, servo reports absent
S_SERVO_PRESENT = "servo-present"     # dongle on USB, servo reports present


def build_identify() -> bytes:
    tx = bytearray(REPORT_SIZE)
    tx[0] = 0x04
    tx[1] = 0x8A
    tx[2] = 0x00
    tx[3] = 0x00
    tx[4] = 0x04
    return bytes(tx)


def is_present(rx: bytes) -> bool:
    return (len(rx) >= 8 and rx[1] == 0x01 and rx[2] == 0x00 and
            rx[5] in (0x03, 0x04) and rx[7] == 0x01)


def stamp() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def log_transition(old: str, new: str, detail: str = "") -> None:
    arrow = f"{old} -> {new}"
    tail = f"  {detail}" if detail else ""
    print(f"[{stamp()}] {arrow}{tail}", flush=True)


class Monitor:
    def __init__(self) -> None:
        import usb.core, usb.util  # noqa
        self.usb = __import__("usb.core", fromlist=["core"])
        self.usb_util = __import__("usb.util", fromlist=["util"])
        self.dev = None
        self.claimed = False
        self.state = S_NO_ADAPTER
        self.last_rx2 = None   # last seen rx[2] for extra diagnostics

    def _release(self) -> None:
        if self.dev is not None and self.claimed:
            try:
                self.usb_util.release_interface(self.dev, 0)
            except Exception:
                pass
        self.claimed = False
        self.dev = None

    def _find_and_claim(self) -> bool:
        """Try to find and claim the dongle. Return True on success."""
        import usb.core as core
        import usb.util as util
        dev = core.find(idVendor=VID, idProduct=PID)
        if dev is None:
            return False
        try:
            if dev.is_kernel_driver_active(0):
                dev.detach_kernel_driver(0)
        except Exception:
            pass
        try:
            dev.set_configuration()
            util.claim_interface(dev, 0)
        except Exception as e:
            # claim failed — likely another process (Parallels, exe, etc)
            # holds the interface. Leave dev=None so we retry next tick.
            log_transition(self.state, self.state,
                           detail=f"(claim failed: {e})")
            return False
        self.dev = dev
        self.claimed = True
        return True

    def _poll_identify(self) -> str:
        """Issue one identify and return the resulting state."""
        try:
            self.dev.write(EP_OUT, build_identify(), timeout=500)
            rx = bytes(self.dev.read(EP_IN, REPORT_SIZE, timeout=500))
        except Exception:
            # Comm failure — assume the dongle is gone or wedged.
            # Release and let the next tick re-find it.
            self._release()
            return S_NO_ADAPTER

        self.last_rx2 = rx[2] if len(rx) > 2 else None
        if is_present(rx):
            return S_SERVO_PRESENT
        return S_ADAPTER_ONLY

    def tick(self) -> None:
        if self.dev is None:
            # Try to find + claim. If it fails, we're NO_ADAPTER.
            if not self._find_and_claim():
                new_state = S_NO_ADAPTER
            else:
                new_state = self._poll_identify()
        else:
            new_state = self._poll_identify()

        if new_state != self.state:
            detail = ""
            if (new_state == S_ADAPTER_ONLY and
                    self.last_rx2 is not None and self.last_rx2 != 0x00):
                detail = f"(rx[2]={self.last_rx2:#04x})"
            log_transition(self.state, new_state, detail=detail)
            self.state = new_state

    def shutdown(self) -> None:
        self._release()


def main() -> int:
    try:
        import usb.core  # noqa: F401
    except ImportError:
        sys.stderr.write("pyusb not installed in this venv\n")
        return 2

    print(f"[{stamp()}] monitor starting, polling every {int(POLL_INTERVAL_S*1000)} ms"
          f"  (Ctrl-C to stop)")
    print(f"[{stamp()}] initial state: {S_NO_ADAPTER}")

    mon = Monitor()
    try:
        while True:
            mon.tick()
            time.sleep(POLL_INTERVAL_S)
    except KeyboardInterrupt:
        print()
        print(f"[{stamp()}] stopped by user")
    finally:
        mon.shutdown()

    return 0


if __name__ == "__main__":
    sys.exit(main())
