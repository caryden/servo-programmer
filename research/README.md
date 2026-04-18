# research/

This directory holds **everything we did to figure out how the Axon
servo programmer works**, kept here for reproducibility and so the
[project narrative](../docs/the-adventure.md) has receipts. None of these
files are part of the shipped release artifacts. They're archaeology,
evidence, and lab notes for the products that grew out of this work:

- [`../apps/cli/`](../apps/cli/) — released cross-platform CLI
- [`../apps/web/`](../apps/web/) — live WebHID app on GitHub Pages
- [`../apps/desktop/`](../apps/desktop/) — Electrobun desktop app

## What's in each subdirectory

| Subdirectory | What's there | Why we kept it |
|---|---|---|
| [`python-tests/`](python-tests/) | All the Python scripts we used to probe the dongle: `axon_libusb_test{,2..7}.py`, `axon_hid_test_probe.py`, `axon_libusb_test_monitor.py`, `axon_libusb_test_status.py`, `hid_probe.py`, the upstream Saleae automation library, and a couple of one-off interleave / monitor scripts | Each one is a chapter in the reverse-engineering story. The numbered `axon_libusb_test*.py` series in particular is the path of progressively-smarter experiments that led to the final working protocol understanding. The `axon_hid_test_probe.py` is the 5-minute hidapi retest that proved libusb was never actually needed. |
| [`saleae-captures/`](saleae-captures/) | Decoded Async Serial CSV exports from the Saleae Logic 2 software, plus small `.sal` session files | These are the wire captures we built our protocol understanding on top of. The 0xCD capture decoded the read flow; the 0xCB capture decoded the write flow; the dual_test7 capture confirmed the dongle is a transparent HID-to-wire proxy. [`axon-recover-micro-2026-04-11-summary.md`](saleae-captures/axon-recover-micro-2026-04-11-summary.md) confirms the firmware recovery/flash path uses 115200 8N1 and then returns to 9600 identify traffic. The 160 MB `Session 0.sal` is gitignored — re-capture if needed. These captures are still the first place to check when a later UI/runtime change needs wire-level validation. |
| [`etw-traces/`](etw-traces/) | Windows ETW trace of the vendor exe running in Parallels: `axon-usb.etl` (binary) and `axon-usb.xml` (decoded) | This is the only USB-side capture we have from the Windows host. Useful as cross-check that our hidapi-side TX bytes match what the vendor exe emits. |
| [`static-analysis/`](static-analysis/) | Decompiled vendor exe source (Ghidra output), the Jython scripts that drove `analyzeHeadless`, the early capstone/pefile probe (`static_analyze.py`), and the Saleae CSV decoder (`decode_saleae_csv.py`) | The Ghidra output is the primary source of truth for "which byte of the config block means what" — see [`docs/BYTE_MAPPING.md`](../docs/BYTE_MAPPING.md). The decoder is reusable for any future capture. |
| [`decrypted-firmware/`](decrypted-firmware/) | The four `.plain.bin` plaintexts from running our `.sfw` decrypter against the bundled Axon Mini and Max firmware files | Ground truth for the TypeScript SFW decrypter port in [#11](https://github.com/caryden/servo-programmer/issues/11). |
| [`sudoers/`](sudoers/) | The narrow NOPASSWD `sudoers` rule and the `install_sudoers.sh` / `uninstall_sudoers.sh` scripts | Only useful for the legacy libusb scripts in `python-tests/`. The production CLI uses node-hid and does not need any of this. |
| [`etw-capture/`](etw-capture/) | The Windows batch script that drives `logman` to set up a USB ETW trace from inside the Parallels VM | Run this from inside Windows to produce a fresh `axon-usb.etl` if you need a new trace. |
| [`session-notes/`](session-notes/) | The original session diary: `REVERSE_ENGINEERING_GUIDE.md` (the early planning doc) and `SESSION_2026-04-09_VM_PROBE.md` (notes from the Parallels/ETW investigation) | Sources for the polished blog post in [`docs/the-adventure.md`](../docs/the-adventure.md). |

## How to read the story

The chronological path is:

1. **Static analysis** of the vendor exe — `static-analysis/static_analyze.py`,
   then `static-analysis/ghidra_out/`. We found the AES-128 key
   (`"TTTTTTTTTTTTTTTT"`) and decrypted the `.sfw` files into the
   plaintexts in `decrypted-firmware/`.
2. **Probing USB from the host** — `python-tests/hid_probe.py`,
   then the seven `axon_libusb_test*.py` experiments. We discovered
   the dongle's primed/cold state machine, the chunked read/write
   protocol, and the plug-in order requirement.
3. **Wire capture** with the Saleae — `saleae-captures/0xcd-data.csv`
   first (read protocol), `saleae-captures/0xcb-data.csv` next
   (write protocol), then `saleae-captures/dual_test7_623.csv`
   for the simultaneous libusb-and-Saleae confirmation. Later,
   `saleae-captures/axon-recover-micro-2026-04-11-summary.md`
   captured a real `axon mode set servo --recover micro --yes`
   flash and established the 115200-baud bootloader wire path.
4. **ETW investigation** in Parallels — `etw-traces/axon-usb.etl`
   and `etw-capture/axon_etw_capture.bat`. Useful as cross-check
   but limited because USBHUB3 only logs URB headers.
5. **The hidapi retest** — `python-tests/axon_hid_test_probe.py`.
   This is where we realized libusb (and the sudo it required) was
   never actually necessary.

The full first-person narrative — with the dead ends, the
"aha" moments, and the reflections on doing this with an agent —
is in [`docs/the-adventure.md`](../docs/the-adventure.md).

Several artifacts that began as research have now graduated into active
product/runtime packages:

- [`../apps/cli/`](../apps/cli/) — released production CLI
- [`../apps/web/`](../apps/web/) — the browser WebHID app
- [`../apps/desktop/`](../apps/desktop/) — the Electrobun desktop app

What still lives only here:

- raw captures
- one-off Python probes
- Ghidra output and scratch analysis
- historical dead ends that are still useful when something regresses
