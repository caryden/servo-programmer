#!/usr/bin/env python3
"""
Axon servo programmer HID client (Python reference implementation).

This is the ground-truth protocol client derived from static analysis in
docs/FINDINGS.md. It speaks the same HID vocabulary that the vendor .exe
does, but only the read-only commands are enabled by default; write
commands are behind explicit flags.

Every HID report is a 64-byte output/input report with Report ID 0x04 and
this layout:

    tx[0] = 0x04          (HID Report ID, constant)
    tx[1] = cmd_byte
    tx[2] = addr_hi       big-endian 16-bit address
    tx[3] = addr_lo
    tx[4] = chunk_len     1..0x3b = 59
    tx[5..] = data bytes (for writes) or 0x00 (for reads)

    rx[0] = 0x04          (echoed Report ID)
    rx[1] = status_a      expected 0x01 for OK
    rx[2] = status_b      expected 0x00
    rx[3..] = reply-specific fields

Commands:

    cmd 0x5A  read 1 byte                (probe)
    cmd 0x8A  identify                    (model + mode + 8-byte name)
    cmd 0x90  write N bytes at addr      (generic, goes to servo RAM/scratch)
    cmd 0x91  read  N bytes at addr      (generic)
    cmd 0xCB  write N bytes at addr      (commits to flash config block)
    cmd 0xCD  read  N bytes at addr      (reads flash config block)

Read/write of more than 59 bytes is transparently chunked into multiple
HID reports with a 25 ms inter-chunk Sleep, matching what FUN_00404900 in
the vendor .exe does.

Usage (as a CLI):

    source ~/tools/axon-hw-venv/bin/activate
    python3 tools/axon_client.py probe
    python3 tools/axon_client.py identify
    python3 tools/axon_client.py read-block --cmd 0xcd --addr 0 --length 95
    python3 tools/axon_client.py self-test
    python3 tools/axon_client.py dump-config [--save path.bin]

    # Write path is gated behind --i-understand-this-writes-to-flash
    python3 tools/axon_client.py restore-config path.bin --i-understand-this-writes-to-flash
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass
from typing import Optional

AXON_VID = 0x0471
AXON_PID = 0x13AA

HID_REPORT_ID = 0x04
HID_REPORT_SIZE = 64           # bytes including the Report ID at index 0
PAYLOAD_MAX_CHUNK = 0x3B       # 59, matches the clamp in FUN_00404900

# Command bytes (from static RE of the vendor .exe)
CMD_PROBE_1B       = 0x5A
CMD_IDENTIFY       = 0x8A
CMD_RAM_WRITE      = 0x90
CMD_RAM_READ       = 0x91
CMD_FLASH_WRITE    = 0xCB      # "Write parameters" — goes to servo flash page
CMD_FLASH_READ     = 0xCD      # "Read parameters"

# Delay between chunked reports — mirrors `Sleep(0x19)` in FUN_00404900.
INTER_CHUNK_SLEEP_S = 0.025

# Timeout for reading a reply report.
READ_TIMEOUT_MS = 500


@dataclass
class IdentifyReply:
    """Parsed response to the 0x8A identify command.

    Offsets taken from the jv1Arrival handler in the vendor .exe (see
    docs/FINDINGS.md §2.1). The exact layout past rx[7] is best-effort
    until we see a real reply — this dataclass will be tightened once we
    have ground-truth bytes.
    """
    raw: bytes
    status_ok: bool       # rx[1] == 0x01 AND rx[2] == 0x00
    model_byte: int       # rx[5]
    mode_byte: int        # rx[7]    (1 = Servo, 0 = Modified CR)
    name_raw: bytes       # rx[8..16] — 8 bytes, '*' used as padding
    name: str             # name_raw with '*' → ' ' and stripped


class AxonClient:
    """Thin wrapper around hidapi for the Axon programmer."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self._dev = None

    # ---- connection lifecycle ------------------------------------------------

    def open(self) -> None:
        import hid  # lazy so --help works without hidapi installed
        dev = hid.device()
        dev.open(AXON_VID, AXON_PID)
        dev.set_nonblocking(False)
        self._dev = dev
        if self.verbose:
            print(f"[axon] opened {AXON_VID:04x}:{AXON_PID:04x} "
                  f"({dev.get_product_string()!r})")

    def close(self) -> None:
        if self._dev is not None:
            self._dev.close()
            self._dev = None

    def __enter__(self) -> "AxonClient":
        self.open()
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # ---- raw transport -------------------------------------------------------

    def _send_report(self, tx: bytes) -> bytes:
        """Send one 64-byte output report and return the 64-byte reply.

        `tx` must be exactly HID_REPORT_SIZE bytes long with tx[0] = 0x04.
        """
        assert self._dev is not None, "client not open"
        assert len(tx) == HID_REPORT_SIZE, f"tx must be {HID_REPORT_SIZE} bytes"
        assert tx[0] == HID_REPORT_ID, f"tx[0] must be {HID_REPORT_ID:#x}"

        if self.verbose:
            print(f"[axon] TX: {tx.hex()}")

        n = self._dev.write(list(tx))
        if n != HID_REPORT_SIZE:
            raise IOError(f"HID write returned {n}, expected {HID_REPORT_SIZE}")

        rx_list = self._dev.read(HID_REPORT_SIZE, timeout_ms=READ_TIMEOUT_MS)
        if not rx_list:
            raise TimeoutError(f"no reply within {READ_TIMEOUT_MS} ms")
        rx = bytes(rx_list)

        if self.verbose:
            print(f"[axon] RX: {rx.hex()}  ({len(rx)} bytes)")

        return rx

    def _build_tx(
        self,
        cmd: int,
        addr: int,
        chunk_len: int,
        data: bytes = b"",
    ) -> bytes:
        """Compose a 64-byte output report."""
        if not (0 <= cmd <= 0xFF):
            raise ValueError(f"cmd out of range: {cmd}")
        if not (0 <= addr <= 0xFFFF):
            raise ValueError(f"addr out of range: {addr}")
        if not (0 <= chunk_len <= PAYLOAD_MAX_CHUNK):
            raise ValueError(
                f"chunk_len out of range: {chunk_len} (max {PAYLOAD_MAX_CHUNK})")
        if len(data) > chunk_len:
            raise ValueError(
                f"data too long: {len(data)} > chunk_len {chunk_len}")

        tx = bytearray(HID_REPORT_SIZE)
        tx[0] = HID_REPORT_ID
        tx[1] = cmd
        tx[2] = (addr >> 8) & 0xFF
        tx[3] = addr & 0xFF
        tx[4] = chunk_len
        tx[5 : 5 + len(data)] = data
        return bytes(tx)

    # ---- high-level commands -------------------------------------------------

    def identify(self) -> IdentifyReply:
        """Send a 0x8A identify command and parse the reply.

        The vendor .exe's arrival handler sends exactly:
            04 8A 00 00 04 00 ... 00
        and checks rx[1]==0x01, rx[2]==0x00 for success.
        """
        tx = self._build_tx(CMD_IDENTIFY, addr=0, chunk_len=4)
        rx = self._send_report(tx)

        status_ok = rx[1] == 0x01 and rx[2] == 0x00
        model = rx[5]
        mode = rx[7]
        name_raw = rx[8:16]
        # '*' is used as padding in the on-flash model name; the vendor .exe
        # rewrites '*' -> ' ' and then trims trailing whitespace.
        name = name_raw.replace(b"*", b" ").decode("ascii", "replace").rstrip()
        return IdentifyReply(
            raw=rx,
            status_ok=status_ok,
            model_byte=model,
            mode_byte=mode,
            name_raw=bytes(name_raw),
            name=name,
        )

    def read_block(
        self,
        addr: int,
        length: int,
        cmd: int = CMD_FLASH_READ,
    ) -> bytes:
        """Read `length` bytes starting at `addr` using the chunked helper.

        Mirrors FUN_004047d0 in the vendor .exe: up to `PAYLOAD_MAX_CHUNK`
        bytes per HID report, 25 ms Sleep between reports, address
        auto-advances by chunk_len each iteration.
        """
        if length < 0:
            raise ValueError(f"length must be >= 0, got {length}")
        out = bytearray()
        cur_addr = addr
        remaining = length
        first = True
        while remaining > 0:
            chunk = min(remaining, PAYLOAD_MAX_CHUNK)
            if not first:
                time.sleep(INTER_CHUNK_SLEEP_S)
            first = False
            tx = self._build_tx(cmd, cur_addr, chunk)
            rx = self._send_report(tx)
            if rx[1] == 0x00:
                raise IOError(
                    f"read_block: device returned error status "
                    f"at addr 0x{cur_addr:04x} (rx[1]=0x00): {rx.hex()}")
            # Data starts at rx[5] in the vendor .exe's receive path
            # (see FUN_004082f0 and the arrival handler's rx[5..15] copy).
            data = rx[5 : 5 + chunk]
            if len(data) != chunk:
                raise IOError(
                    f"read_block: short reply at 0x{cur_addr:04x}, "
                    f"wanted {chunk} bytes got {len(data)}: {rx.hex()}")
            out += data
            cur_addr += chunk
            remaining -= chunk
        return bytes(out)

    def write_block(
        self,
        addr: int,
        data: bytes,
        cmd: int = CMD_FLASH_WRITE,
    ) -> None:
        """Write `data` starting at `addr` using the chunked helper.

        Mirrors FUN_00404900. **This is the write path.** Only use with an
        explicit user opt-in — calling write_block with cmd=0xCB will
        rewrite the servo's flash config page via on-servo IAP.
        """
        cur_addr = addr
        pos = 0
        first = True
        while pos < len(data):
            chunk = min(len(data) - pos, PAYLOAD_MAX_CHUNK)
            if not first:
                time.sleep(INTER_CHUNK_SLEEP_S)
            first = False
            tx = self._build_tx(cmd, cur_addr, chunk, data[pos : pos + chunk])
            rx = self._send_report(tx)
            if rx[1] == 0x00:
                raise IOError(
                    f"write_block: device returned error status "
                    f"at addr 0x{cur_addr:04x} (rx[1]=0x00): {rx.hex()}")
            cur_addr += chunk
            pos += chunk


# ---- CLI front-end -----------------------------------------------------------

def cmd_probe(args) -> int:
    """Just open/close — prints descriptor strings (does not send anything)."""
    with AxonClient(verbose=args.verbose) as c:
        dev = c._dev
        print(f"manufacturer : {dev.get_manufacturer_string()!r}")
        print(f"product      : {dev.get_product_string()!r}")
        print(f"serial       : {dev.get_serial_number_string()!r}")
    return 0


def cmd_identify(args) -> int:
    with AxonClient(verbose=args.verbose) as c:
        r = c.identify()
    print(f"raw          : {r.raw.hex()}")
    print(f"status_ok    : {r.status_ok}  (rx[1]=0x{r.raw[1]:02x}, rx[2]=0x{r.raw[2]:02x})")
    print(f"rx[3..5]     : {r.raw[3:5].hex()}  (fields TBD)")
    print(f"model_byte   : 0x{r.model_byte:02x}  ({r.model_byte})")
    print(f"rx[6]        : 0x{r.raw[6]:02x}")
    print(f"mode_byte    : 0x{r.mode_byte:02x}  ({'Servo' if r.mode_byte==1 else 'CR' if r.mode_byte==0 else '?'})")
    print(f"name_raw     : {r.name_raw.hex()}  ({r.name_raw!r})")
    print(f"name         : {r.name!r}")
    print(f"trailing     : {r.raw[16:32].hex()}")
    if not r.status_ok:
        print("WARNING: status bytes do not look OK — is a servo plugged into the programmer?")
        return 1
    return 0


def cmd_read_block(args) -> int:
    with AxonClient(verbose=args.verbose) as c:
        data = c.read_block(
            addr=args.addr,
            length=args.length,
            cmd=args.cmd,
        )
    if args.save:
        with open(args.save, "wb") as f:
            f.write(data)
        print(f"saved {len(data)} bytes to {args.save}")
    # Pretty hex dump
    print(f"\n{len(data)} bytes @ addr 0x{args.addr:04x} (cmd 0x{args.cmd:02x}):")
    for off in range(0, len(data), 16):
        chunk = data[off : off + 16]
        hex_part = " ".join(f"{b:02x}" for b in chunk)
        ascii_part = "".join(
            chr(b) if 32 <= b < 127 else "." for b in chunk)
        print(f"  {args.addr + off:04x}  {hex_part:<47s}  {ascii_part}")
    return 0


def cmd_dump_config(args) -> int:
    """Read the 95-byte config block using cmd 0xCD at addr 0."""
    args.cmd = CMD_FLASH_READ
    args.addr = 0
    args.length = 0x5F
    return cmd_read_block(args)


def cmd_self_test(args) -> int:
    """Replay FUN_00404a28: read 32 @ 0, write 32 @ 0x100, read 32 @ 0.

    If the flag byte at offset 0 of the scratch window flips from 0 to 1,
    the servo's command-dispatch + flash-IAP path is healthy.
    """
    with AxonClient(verbose=args.verbose) as c:
        first = c.read_block(addr=0x0000, length=0x20, cmd=CMD_RAM_READ)
        print(f"initial read 32 @ 0x0000: {first.hex()}")
        print(f"  byte[0] = 0x{first[0]:02x}")
        if first[0] == 0:
            print("flag is 0 — attempting to flip via write @ 0x0100")
            c.write_block(addr=0x0100, data=first, cmd=CMD_RAM_WRITE)
            second = c.read_block(addr=0x0000, length=0x20, cmd=CMD_RAM_READ)
            print(f"after write: {second.hex()}")
            print(f"  byte[0] = 0x{second[0]:02x}")
            if second[0] == 1:
                print("SELF-TEST PASSED — servo honors cmd 0x90/0x91")
                return 0
            else:
                print("SELF-TEST FAILED — byte did not flip to 1")
                return 2
        elif first[0] == 1:
            print("flag is already 1 — servo is in post-self-test state")
            print("SELF-TEST PASSED (idempotent)")
            return 0
        else:
            print(f"SELF-TEST INCONCLUSIVE — unexpected flag value 0x{first[0]:02x}")
            return 2


def cmd_watch(args) -> int:
    """Re-implement tmr1Timer (= jv1Arrival = FUN_0040330c) in Python.

    The vendor .exe polls 0x8A identify every 300 ms and edge-triggers
    "Servo plug-in!" / "Servo remove!" messages on transitions. We do the
    same here so the user can hot-plug servos and see immediate feedback
    without running the vendor app.
    """
    period = args.period
    print(f"polling identify every {int(period*1000)} ms — Ctrl-C to stop")
    print("expected reply for 'servo present + correctly wired':")
    print("  rx[1]==0x01  rx[2]==0x00  rx[5] in {0x03, 0x04}  rx[7]==0x01")
    print()
    prev_present = False
    prev_rx2 = None
    poll_count = 0
    with AxonClient(verbose=False) as c:
        try:
            while True:
                tx = c._build_tx(CMD_IDENTIFY, addr=0, chunk_len=4)
                try:
                    rx = c._send_report(tx)
                except Exception as e:
                    print(f"  [error] {e}")
                    time.sleep(period)
                    continue
                poll_count += 1
                rx1, rx2, rx5, rx7 = rx[1], rx[2], rx[5], rx[7]
                # Match the exe's gating logic exactly
                model_code = None
                if rx1 == 0x01 and rx2 == 0x00:
                    if rx5 == 0x03 and rx7 == 0x01:
                        model_code = 0x352
                    elif rx5 == 0x04 and rx7 == 0x01:
                        model_code = 0x357
                present = model_code is not None

                # Print on transition or first poll or rx[2] change
                if (present != prev_present) or (rx2 != prev_rx2 and poll_count <= 3):
                    name_raw = rx[8:16]
                    name = name_raw.replace(b"*", b" ").decode("ascii", "replace").rstrip()
                    if present:
                        tag = "PRESENT"
                        detail = (f"model_code=0x{model_code:x} "
                                  f"name={name!r} "
                                  f"rx[1..7]={rx[1:8].hex()}")
                    else:
                        tag = "absent "
                        detail = (f"rx[1]={rx1:#04x} rx[2]={rx2:#04x} "
                                  f"rx[5]={rx5:#04x} rx[7]={rx7:#04x}")
                    ts = time.strftime("%H:%M:%S")
                    print(f"  {ts} #{poll_count:5d}  {tag}  {detail}")

                if present and not prev_present:
                    print(f"  >>> SERVO PLUG-IN! <<<")
                if prev_present and not present:
                    print(f"  >>> SERVO REMOVE! <<<")

                prev_present = present
                prev_rx2 = rx2
                time.sleep(period)
        except KeyboardInterrupt:
            print(f"\nstopped after {poll_count} polls")
    return 0


def cmd_restore_config(args) -> int:
    """Write a saved 95-byte config block back to the servo (cmd 0xCB)."""
    if not args.i_understand_this_writes_to_flash:
        sys.stderr.write(
            "refusing to write to flash without "
            "--i-understand-this-writes-to-flash\n")
        return 2
    with open(args.file, "rb") as f:
        data = f.read()
    if len(data) != 0x5F:
        sys.stderr.write(
            f"expected exactly 95 bytes, got {len(data)} ({args.file})\n")
        return 2
    with AxonClient(verbose=args.verbose) as c:
        # Belt and braces: snapshot current state first
        before = c.read_block(addr=0, length=0x5F, cmd=CMD_FLASH_READ)
        snap_path = f"/tmp/axon_config_before_restore_{int(time.time())}.bin"
        with open(snap_path, "wb") as f:
            f.write(before)
        print(f"pre-write snapshot saved to {snap_path}")

        c.write_block(addr=0, data=data, cmd=CMD_FLASH_WRITE)
        after = c.read_block(addr=0, length=0x5F, cmd=CMD_FLASH_READ)
        if after == data:
            print("write verified — readback matches file byte-for-byte")
            return 0
        else:
            print("write FAILED — readback differs from file")
            # Diff summary
            diffs = [(i, data[i], after[i]) for i in range(0x5F) if data[i] != after[i]]
            print(f"differing bytes: {len(diffs)}")
            for off, want, got in diffs[:16]:
                print(f"  0x{off:02x}: want {want:02x}  got {got:02x}")
            return 3


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--verbose", "-v", action="store_true", help="print every HID report")

    sp = p.add_subparsers(dest="subcommand", required=True)

    sp.add_parser("probe", help="open the device, print strings, close").set_defaults(func=cmd_probe)
    sp.add_parser("identify", help="send cmd 0x8A and parse the reply").set_defaults(func=cmd_identify)

    rp = sp.add_parser("read-block", help="generic chunked read (default cmd 0xCD)")
    rp.add_argument("--cmd", type=lambda s: int(s, 0), default=CMD_FLASH_READ)
    rp.add_argument("--addr", type=lambda s: int(s, 0), default=0)
    rp.add_argument("--length", type=lambda s: int(s, 0), default=0x5F)
    rp.add_argument("--save", type=str, default=None, help="save raw bytes to this path")
    rp.set_defaults(func=cmd_read_block)

    dc = sp.add_parser("dump-config", help="shortcut: read 95 bytes @ 0 with 0xCD")
    dc.add_argument("--save", type=str, default=None)
    dc.set_defaults(func=cmd_dump_config)

    st = sp.add_parser("self-test", help="replay FUN_00404a28 (cmds 0x90/0x91)")
    st.set_defaults(func=cmd_self_test)

    wt = sp.add_parser("watch",
                       help="poll identify like tmr1Timer (300ms), edge-trigger plug-in/out")
    wt.add_argument("--period", type=float, default=0.3,
                    help="polling interval in seconds (default 0.3 = matches the exe)")
    wt.set_defaults(func=cmd_watch)

    wr = sp.add_parser("restore-config", help="write a saved config back (cmd 0xCB)")
    wr.add_argument("file", type=str)
    wr.add_argument("--i-understand-this-writes-to-flash", action="store_true")
    wr.set_defaults(func=cmd_restore_config)

    args = p.parse_args()
    try:
        return args.func(args)
    except Exception as e:
        sys.stderr.write(f"ERROR: {e}\n")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
