# Autonomous VM probe session — 2026-04-09

Goal: do as much protocol diagnosis as possible without breaking out the
Saleae or interrupting the user, by driving the Parallels Windows VM via
`prlctl exec`.

## What I confirmed works

| Capability | How | Implications |
|---|---|---|
| `prlctl exec "Windows 11" cmd /c <cmd>` runs as `NT AUTHORITY\SYSTEM` | direct CLI | We can run any Windows command, batch file, PowerShell, or installed tool from the Mac side with no UAC. |
| Parallels shared folder `\\Mac\Home\github\servo-programmer\samples\` is read+write from inside the VM | `prlctl exec ... cmd /c "dir \\Mac\\Home\\..."` | We can drop files into the repo from inside Windows directly. No copy-paste round-trips needed. |
| Windows registry queries (`reg query`) work | `prlctl exec ... reg query "HKLM\..."` | We can read cached HID device parameters, driver versions, anything in HKLM/HKCU. |
| PowerShell `Get-PnpDevice` enumeration works | `prlctl exec ... powershell -NoProfile -Command "Get-PnpDevice ..."` | We can introspect any PnP device the VM has ever seen. |

## What I found out about USB attach

| Attempt | Result |
|---|---|
| `prlsrvctl usb set <id> <vm>` | Sets the **autoconnect rule** for next plug event, does NOT actively transfer the device. The dongle stays where it is. |
| `prlsrvctl usb del <id>` then `set` again | Same, just resets the rule. |
| `pnputil /scan-devices` inside the VM | Triggers a PnP rescan, but the dongle still doesn't appear because Parallels' USB pass-through layer isn't routing it to the VM. |
| `prlctl set --device-add` / `--device-set` | These exist for HDDs / optical drives / network adapters, NOT for USB devices. There is no `prlctl` command to actively transfer a USB device to a running VM. |

**Conclusion:** Parallels USB pass-through requires a real plug event for autoconnect rules to fire. There is no CLI to "attach this currently-plugged-in USB device to the VM right now." The only ways to do that are (a) physically unplug + replug, or (b) the GUI Devices menu. **Autonomous USB attachment is not possible from the Mac CLI alone.**

## What I could still do without VM USB access

### Registry probe of cached HID device info

Output from `reg query "HKLM\SYSTEM\CurrentControlSet\Enum\HID\VID_0471&PID_13AA" /s`:

- `HardwareID` includes `HID\VID_0471&UP:FF00_U:0001` and `HID_DEVICE_UPR:FF00-FFFF` — confirms vendor-defined HID, **usage page 0xFF00**, **usage 0x0001**.
- `DeviceDesc`: "HID-compliant vendor-defined device"
- Driver: HID class GUID `{745a17a0-74d3-11d0-b6fe-00a0c90f57da}` index `0009`, "input.inf" `HID_Raw_Inst.NT`, matching device id `HID_DEVICE_UPR:FF00-FFFF`
- The HID **report descriptor itself is not stored** in the standard
  `Device Parameters` subkey on this build — Windows hidclass.sys queries
  it from the device every enumeration rather than caching it in the
  registry.

### HID API call-site analysis in the .exe

I exhaustively searched for *any* read reference (mov / call / push) to each of the resolved HID function-pointer globals JVCL stores:

| HID API | function-pointer global | reads found from app code |
|---|---|---|
| `HidD_GetAttributes` | `0x7c673c` | **0** |
| `HidD_FlushQueue` | `0x7c6728` | **0** |
| `HidD_GetConfiguration` | `0x7c6720` | **0** |
| `HidD_SetConfiguration` | `0x7c6724` | **0** |
| `HidD_GetNumInputBuffers` | `0x7c6734` | **0** |
| `HidD_SetNumInputBuffers` | `0x7c6738` | **0** |
| `HidD_GetFeature` | `0x7c672c` | **0** |
| `HidD_SetFeature` | `0x7c6730` | **0** |

There IS a JVCL "loader table" at `.data:0x7c4f14..0x7c4fc4` that holds pointers to all the function-pointer globals (used to iterate them at startup for `GetProcAddress` resolution), but no **app code** ever reads any of these globals.

**This rules out the `HidD_SetNumInputBuffers` theory.** I had hypothesized the .exe might be calling it to bump the kernel input buffer count, which would explain the "always 2 outstanding reads" behavior we saw in the ETW trace. But the .exe never calls it. The 2 outstanding reads are just Windows hidclass.sys default behavior, which is a hard-coded value in the kernel-mode driver. **macOS IOHIDDevice does its own thing and there's no equivalent setting.**

### Set_Idle test from macOS via libusb (BLOCKED by macOS permission model)

Wrote `tools/axon_libusb_test.py`. Sends Set_Idle (HID class request, `bRequest=0x0A`, `bmRequestType=0x21`) via libusb, then attempts identify+read.

Result on first run:
```
Phase 0: Find and claim the dongle via libusb
  found: 'Stone Laboratories inc.' 'USBBootloader V1.3'
  detaching kernel HID driver from interface 0
  (kernel driver check raised USBError(13, 'Access denied'), continuing)
  could not claim interface 0 ([Errno 13] Access denied (insufficient permissions))
```

Even with the interface-claim made optional and trying just the control transfer through endpoint 0, macOS rejects the request because **IOHIDFamily owns the dongle and IOKit doesn't let libusb touch any pipe of a HID-owned device without root**.

**To run this test we need `sudo`**, which I will not do autonomously without explicit user permission.

## Where this leaves us

We've now eliminated, with high confidence, every host-side software difference we can detect statically:

- ✗ Different HID transfer size (both send 64 B)
- ✗ Different endpoint type (both use interrupt OUT/IN)
- ✗ Different cmd byte (`0xCD` is correct, statically verified)
- ✗ Different addr/len arguments (`addr=0`, `len=0x5F`, statically verified)
- ✗ `HidD_SetNumInputBuffers` call from app code (the .exe never calls it)
- ✗ Most other `HidD_*` calls from app code (verified by xref search)

The only remaining hypotheses we haven't ruled out are:

- **Set_Idle.** macOS IOHIDFamily may not send Set_Idle on `IOHIDDeviceOpen` for vendor-defined HID devices, while Windows hidclass.sys does. Testable from Mac with **sudo** + libusb. ~10 minutes once user authorises sudo.
- **2-outstanding-read-URB behaviour.** Windows kernel hidclass.sys keeps 2 input URBs queued at all times. macOS IOHIDDevice uses a callback pattern that may not maintain a parallel pipeline. Testable only via libusb (sudo) by manually pumping reads.
- **A wire-side state-machine difference** in the dongle MCU that depends on subtle USB timing or ordering not visible at this level. Only testable with the **Saleae logic analyzer on the dongle ↔ servo wire** because it's below every host-side layer.

## Recommended next steps, in order of cost vs. information

1. **Sudo + libusb test (~10 min, requires user "OK to use sudo").** Run `tools/axon_libusb_test.py` with `sudo`. If Set_Idle + identify + read all succeed, the bug is "macOS doesn't send Set_Idle for vendor HID" and we have a workaround (we use libusb instead of hidapi for setup, then hand off to hidapi for the data path; or use libusb for everything).
2. **Saleae capture on the servo wire (~30 min, requires hardware).** Three captures (idle / our Python / the .exe). Direct comparison of UART traffic at the wire layer answers everything definitively.
3. **Pivot to a hybrid: offline web app (loads/saves `.svo`, decrypts `.sfw`, fully decoded parameter editor) + leave the live read/write to the .exe for now.** Not ideal, but ships something useful today.

## Files added this session

- `tools/axon_libusb_test.py` — Set_Idle + interleaved identify/read via pyusb, currently blocked by macOS permissions
- `docs/SESSION_2026-04-09_VM_PROBE.md` — this document

## Files unchanged but verified

- The dongle is in a clean state: autoconnect=host, present-on-host, no exclusive owner.
- Parallels has no claim on it.
- macOS hidapi can talk to it normally as soon as you start any of the existing scripts.
