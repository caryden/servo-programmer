# research/saleae-captures/

Wire captures from a Saleae Logic 8 on the Axon servo signal line. The
9600 baud Async Serial analyzer in Logic 2 decodes the bytes; we then
export each capture's analyzer table as CSV and parse it back with
[`../static-analysis/decode_saleae_csv.py`](../static-analysis/decode_saleae_csv.py),
which reconstructs the `FF FF | ID | LEN | INSTR/ERR | PARAMS | CHKSUM`
frames and validates the bitwise-NOT checksums.

## Captures

| File | What it captures | What it proved |
|---|---|---|
| `0xcd-data.csv` | The vendor exe's "Read" button click — three identify keepalives followed by two `0xCD` read frames `(addr=0x00, len=0x3B)` and `(addr=0x3B, len=0x24)`, with the corresponding 65-byte and 42-byte servo replies | Decoded the read flow and the chunked 59 + 36 = 95-byte transfer pattern. First definitive proof of the wire-side framing. |
| `0xcb-data.csv` | The vendor exe's "Write" button click — first the read pair from above, then two `0xCB` write frames carrying 59 and 36 bytes back to the servo | Decoded the write flow. Confirmed writes are fire-and-forget on the wire (no servo ACK). Showed the exe does a read-then-write cycle even when the user only clicks Write. |
| `dual_test7_623.csv` | The dual-capture experiment from `axon_libusb_test7.py` — Python drove libusb while Saleae recorded the wire, capturing identify-x3 + read-chunk0 + read-chunk1 + identify-x2 | Proved end-to-end that our libusb `0xCD` reaches the wire as the exact same byte sequence the vendor exe emits, AND that the HID reply contains the raw wire data verbatim at `rx[5..]`. The "click" capture. |
| `digital.csv` | Raw digital edges from Channel 0 (the signal wire) for one of the captures | Useful only as a sanity check that the analyzer settings (9600 baud, 8N1, non-inverted) are right. The decoded CSVs above contain everything actionable. |
| `dual_capture_read_probe_20260409_180018.csv` + `.sal` | A small auxiliary capture from an earlier dual-capture attempt | Kept for completeness, not load-bearing. |
| `Session 0.sal` (gitignored) | The 160 MB binary Saleae session file containing all the raw samples for the captures above | Too large for GitHub. If you need to re-run the analyzer with different settings, re-capture from hardware. The Async Serial CSV exports here contain everything we used. |

## Re-decoding any capture

```bash
~/tools/axon-hw-venv/bin/python3 research/static-analysis/decode_saleae_csv.py \
    research/saleae-captures/0xcd-data.csv | head -20
```

The decoder is content-framed (uses the `FF FF` + `LEN` header to split
frames, not timing) so it works on any capture regardless of inter-frame
gaps. Output looks like:

```
t= +3.629807s  len=  8  ff ff 01 04 cd 00 3b f2
    => HOST -> id=0x01 read      params=00 3b [OK ]
t= +3.639274s  len= 65  ff ff 01 3d 00 3b d0 0b f6 82 82 80 ...
    => SERVO-> id=0x01 err=0x00 data(59)=3b d0 0b f6 82 82 80 ... [OK ]
```

## Capturing your own

1. Connect the Saleae probe to the servo signal wire (Channel 0)
2. Open Logic 2, set sample rate to 4 MS/s
3. Add an Async Serial analyzer on Channel 0 with: 9600 baud, 8 bits, 1 stop bit, no parity, LSB-first, non-inverted
4. Click capture, run your experiment, click stop
5. Export the analyzer table as CSV (gear icon next to "Async Serial" → Export Table)
6. Save to `research/saleae-captures/<your-capture>.csv`
7. Decode with `decode_saleae_csv.py` as above
