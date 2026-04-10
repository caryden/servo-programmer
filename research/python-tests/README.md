# research/python-tests/

Every Python script we wrote during the reverse-engineering session,
in roughly the order we wrote them. None are imported by the
production CLI in `../axon/` — these are diagnostic / experiment
scripts kept for reference and reproducibility.

## What each script proved (or disproved)

### Early enumeration

| Script | What it does | What it proved |
|---|---|---|
| `hid_probe.py` | Enumerates all HID devices, finds the Axon dongle by VID/PID, prints its descriptor | Confirmed VID `0x0471` PID `0x13AA`, manufacturer `Stone Laboratories inc.`, product `USBBootloader V1.3`, HID class with one interface and 64-byte reports. The first script we ever ran against the device. |
| `axon_client.py` | An early all-in-one client that mixed enumeration, identify, read, write, and flashing into one script | Found the basic identify command (`0x8A`) and the report structure. Mostly historical now — superseded by the `axon_libusb_test*.py` series. |
| `axon_monitor.py` | Early presence-monitor experiment using hidapi | First time we hit the "identify works once then returns 0xFA forever" decay pattern. We initially blamed hidapi for it; we were wrong (see `axon_hid_test_probe.py`). |

### The libusb investigation series

| Script | What it does | What it proved |
|---|---|---|
| `axon_libusb_test.py` | First libusb attempt: detach kernel driver, claim interface, identify | macOS requires sudo to claim HID-class interfaces via libusb (IOKit owns them). With sudo, we got 4 PRESENT replies in a row, then `0xFA` forever — same decay pattern as hidapi. |
| `axon_libusb_test2.py` | Multiple read variants with different timings and chunk lengths | Variant 1 returned the only successful read in the whole test run (0x3B bytes back), but the data was scrambled and didn't match the wire reply. We later understood this was an `rx[2]==0x02` NACK with stale buffer contents. |
| `axon_libusb_test3.py` | Four sub-tests (drain extra reports, small reads, model-id read, chained keepalive) | Never ran successfully — state-decay pattern killed it before it got useful data. We learned that re-running `wait_for_present` was itself wiping the primed state. |
| `axon_libusb_test4.py` | All operations in one tight burst, no `wait_for_present` between variants, full hex dumps of every reply | Validated the "do everything in one primed window" hypothesis and produced the first relatively-clean log of an exe-style read sequence. |
| `axon_libusb_test5.py` | Three variants testing the "we read HID IN too fast" theory: sleep 80 ms, drain multiple reports, blocking read | Disproved the timing-race theory. The `0xFA` decay was a state machine, not a race. |
| `axon_libusb_test6.py` | The first dual-capture attempt — drives libusb while a Saleae capture runs, with `dev.reset()` as a "prime" | **Discovered that `dev.reset()` is destructive.** It puts the dongle into cold state and our `0xCD` commands are silently dropped — zero frames on the wire. The single most important finding from the libusb era. |
| `axon_libusb_test7.py` | Half-automated dual-capture: Python drives libusb, user starts/stops Saleae manually | **Proved the dongle is a transparent HID-to-wire proxy when properly primed.** Our libusb `0xCD` reached the wire as `FF FF 01 04 CD 00 3B F2`, identical to the vendor exe. The HID reply contained the raw wire data verbatim at `rx[5..5+N]`. The big "click" moment. |
| `axon_libusb_test_status.py` | A small one-shot status checker using the final-known-good libusb pattern | Reusable presence checker before the production CLI existed. |
| `axon_libusb_test_monitor.py` | A live presence monitor at 300 ms cadence using the final-known-good pattern | Same idea as the production CLI's `axon monitor`, just in Python. |

### The hidapi vindication

| Script | What it does | What it proved |
|---|---|---|
| `axon_hid_test_probe.py` | The 5-minute retry: open the dongle via the `hid` package (no libusb, no sudo), run the same identify-then-read sequence as `axon_libusb_test7.py`, compare against the known-good wire bytes | **hidapi worked perfectly first try.** 3/3 PRESENT, full 59/59 byte match on chunk 0. The early `0xFA forever` we'd seen with hidapi months earlier had nothing to do with the transport — it was the same state-decay we eventually understood at the protocol level. We did not need libusb. We did not need sudo. The whole libusb detour was a misdiagnosed protocol bug. **This script unlocked the sudo-free production CLI.** |

### Upstream Saleae tooling (from PR #1)

| Script | What it does |
|---|---|
| `saleae_capture.py` | A higher-level wrapper around the Saleae automation API for scripted captures with triggers and filenames |
| `analyze_capture.py` | A general-purpose decoder for any captured wire data |
| `serial_monitor.py` | A live serial monitor that reads from the wire in real time |
| `axon_interleave_test.py` | Tests the half-duplex bus by interleaving probe + observe on a single channel |

These three came in via the upstream "Add logic analyzer research and Saleae capture tooling" PR. We didn't end up using them in the main investigation (the simpler manual Saleae-then-CSV-export workflow was faster), but they're kept here for completeness.

## Running them

All of these are Python 3 scripts that use the `pyusb` (libusb) and `hid` (hidapi) packages. Set up a venv:

```bash
python3 -m venv ~/tools/axon-hw-venv
source ~/tools/axon-hw-venv/bin/activate
pip install pyusb hidapi logic2-automation
```

Then run from the repo root:

```bash
# hidapi-based scripts (no sudo)
~/tools/axon-hw-venv/bin/python3 research/python-tests/axon_hid_test_probe.py

# libusb-based scripts (need sudo on macOS unless the rules in research/sudoers/ are installed)
sudo ~/tools/axon-hw-venv/bin/python3 research/python-tests/axon_libusb_test_status.py
```

If you want the sudo-free workflow on the libusb scripts too, see [`../sudoers/`](../sudoers/).
