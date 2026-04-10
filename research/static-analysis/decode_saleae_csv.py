#!/usr/bin/env python3
"""
Decode a Saleae Logic 2 Async Serial CSV export into Dynamixel-style
frames and pretty-print them.

The Axon dongle-to-servo wire protocol is Dynamixel-v1-like:

    FF FF <ID> <LEN> <INSTR or ERR> <PARAMS...> <CHKSUM>

where LEN = 1(INSTR/ERR) + N(params) + 1(CHKSUM), and
CHKSUM = (~(ID + LEN + INSTR + PARAMS)) & 0xFF   (bitwise NOT, NOT two's complement).

Host frames are requests carrying an "instruction" byte (0x8A=identify,
0xCD=read, 0xCB=write). Servo reply frames carry an "error" byte in the
same position (0x00 = OK).

This tool:
  1. Reads the CSV, which has columns: Time [s], Value, Parity Error, Framing Error
  2. Groups bytes into frames using the inter-byte gap (~10 ms of silence
     is always a new frame; a normal byte is ~1.04 ms at 9600 baud).
  3. For each frame, verifies the checksum and annotates direction.

Usage:
    ~/tools/axon-hw-venv/bin/python3 tools/decode_saleae_csv.py \\
        samples/saleae/0xcd-data.csv
"""

from __future__ import annotations

import csv
import sys
from dataclasses import dataclass
from pathlib import Path

# Known on-wire instruction byte meanings (host -> servo).
INSTR_NAMES = {
    0x8A: "identify",
    0xCD: "read",
    0xCB: "write",
    0x90: "selftest0",
    0x91: "selftest1",
    0x5A: "probe",
}

# Gap (seconds) between bytes that must be interpreted as "end of frame".
# At 9600 baud a single byte is ~1.04 ms. The dongle pauses for several ms
# between the command frame and the servo's reply, so anything >3 ms is a
# safe boundary. We use 2 ms so we also split back-to-back request/reply.
FRAME_GAP_S = 0.002


@dataclass
class Frame:
    start_s: float
    end_s: float
    bytes: bytes

    def __len__(self) -> int:
        return len(self.bytes)


def load_csv(path: Path) -> list[tuple[float, int]]:
    """Return [(time_s, byte_value), ...] dropping error rows."""
    rows: list[tuple[float, int]] = []
    with path.open() as f:
        reader = csv.reader(f)
        header = next(reader)  # noqa: F841 — just consume the header
        for row in reader:
            if len(row) < 2:
                continue
            # Skip rows where framing/parity error is set and value is zero
            # (these are the "inter-frame noise" markers Saleae adds).
            parity_err = row[2] if len(row) > 2 else ""
            framing_err = row[3] if len(row) > 3 else ""
            if parity_err or framing_err:
                continue
            t = float(row[0])
            val = int(row[1], 16) if row[1].startswith("0x") else int(row[1])
            rows.append((t, val & 0xFF))
    return rows


def group_frames(rows: list[tuple[float, int]]) -> list[Frame]:
    """Group bytes into frames using the FF FF header + declared LEN.

    Timing alone doesn't work — the servo turns around its reply well
    inside the FRAME_GAP_S threshold. We walk the stream, look for the
    0xFF 0xFF preamble, read ID and LEN, then consume exactly LEN+4
    bytes total.
    """
    frames: list[Frame] = []
    n = len(rows)
    i = 0
    while i < n - 3:
        # Find FF FF
        if rows[i][1] != 0xFF or rows[i + 1][1] != 0xFF:
            i += 1
            continue
        # Need at least 4 header bytes: FF FF ID LEN
        if i + 3 >= n:
            break
        ln = rows[i + 3][1]
        total = 4 + ln  # FF FF ID LEN + LEN bytes (INSTR/ERR + PARAMS + CHKSUM)
        if i + total > n:
            # Incomplete trailing frame — capture what we have
            frm = bytes(b for _, b in rows[i:n])
            frames.append(Frame(rows[i][0], rows[-1][0], frm))
            break
        frm = bytes(b for _, b in rows[i:i + total])
        frames.append(Frame(rows[i][0], rows[i + total - 1][0], frm))
        i += total
    return frames


def checksum(payload: bytes) -> int:
    return (~sum(payload)) & 0xFF


def classify(frame: Frame) -> str:
    """Return a human description of this frame."""
    b = frame.bytes
    if len(b) < 6 or b[0] != 0xFF or b[1] != 0xFF:
        return f"RAW ({len(b)} bytes, no FFFF header)"
    sid = b[2]
    ln = b[3]
    # LEN = count of bytes from INSTR/ERR to CHKSUM inclusive
    expected_total = 4 + ln  # FF FF ID LEN + LEN bytes
    if len(b) != expected_total:
        return f"MALFORMED (hdr says {expected_total} bytes, got {len(b)})"
    instr = b[4]
    params = b[5:5 + (ln - 2)]
    chk = b[4 + (ln - 1)]
    good = checksum(b[2:4 + (ln - 1)]) == chk
    mark = "OK " if good else "BAD"

    # Host request?  Known INSTR byte in host-side table.
    if instr in INSTR_NAMES:
        return (f"HOST -> id={sid:#04x} {INSTR_NAMES[instr]:9s} "
                f"params={params.hex(' ')} [{mark}]")

    # Otherwise treat as a servo reply: byte-4 is ERROR.
    err = instr
    return (f"SERVO-> id={sid:#04x} err={err:#04x} "
            f"data({len(params)})={params.hex(' ')} [{mark}]")


def summarize(frame: Frame) -> None:
    print(f"t={frame.start_s:+10.6f}s  len={len(frame):3d}  "
          f"{frame.bytes.hex(' ')}")
    print(f"    => {classify(frame)}")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: decode_saleae_csv.py <path-to-csv> [--head N]")
        return 1
    path = Path(argv[1])
    head = None
    if "--head" in argv:
        head = int(argv[argv.index("--head") + 1])

    rows = load_csv(path)
    print(f"# decoded {len(rows)} bytes from {path}")
    frames = group_frames(rows)
    print(f"# grouped into {len(frames)} frames "
          f"(gap threshold {FRAME_GAP_S*1000:.1f} ms)")
    print()

    shown = 0
    for f in frames:
        summarize(f)
        shown += 1
        if head is not None and shown >= head:
            print(f"... {len(frames) - shown} more frames suppressed")
            break

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
