# The Adventure

*A first-person account of reverse-engineering a closed hardware/software
system end-to-end with Claude Code, a Saleae Logic 8, and a lot of wrong
turns.*

## 1. The hook

I have an FTC robot, and it uses Axon smart servos. Axon sells a little
USB dongle that you plug into a Windows PC to configure those servos.
One problem: my laptop is a Mac, the vendor programmer software is a
32-bit Windows-only `.exe`, and my Parallels runs ARM Windows while the
exe is x86. The emulation layer was flaky enough that I never quite got
a clean read of a servo.

I could have found an Intel Mac, borrowed a Windows box, or just used
the robot without tweaking the servos. Instead I thought: *let me see
how far Claude Code can take me on a project like this*. This whole
thing is a research experiment as much as it is a tool. I wanted to see
how far a single developer plus an agent could go against a stubborn,
closed HW/SW system. What follows is what happened.

## 2. What's an Axon servo?

Thirty-second briefing for anyone not in FTC robotics. A regular hobby
servo takes a PWM pulse and moves to an angle. A *smart* servo has a
microcontroller inside with configurable parameters: range of motion,
center position, direction, deadband, PID constants. You tune those
once and the servo just behaves. Axon makes three of these (Mini, Max,
Micro) and sells a **programmer**: a USB dongle with a 3-wire cable
that plugs into the servo's signal pin. You plug the dongle into a PC,
run the vendor's Axon Servo Programming Software, and click through a
GUI to read or write the servo's configuration block.

The dongle is the only way to configure these servos. If the vendor
software doesn't run on your laptop, you're stuck — and a lot of FTC
teams run Macs.

## 3. The plan

My goal was modest: read and write the servo's config from a Mac. A
CLI, not a GUI. Stretch goal: also flash the vendor firmware modes
(standard PWM vs. continuous rotation), which ship as encrypted `.sfw`
files only the vendor software knows how to load.

I wanted to learn a few things along the way. How much of this kind of
work can an agent like Claude Code actually drive? Where does it get
stuck? I had, or could get, all of these tools:

- **Ghidra** — the NSA's open-source disassembler and decompiler.
  Reads a Windows exe and produces something close to readable C.
- **Saleae Logic 8** — a USB logic analyzer that clips onto wires and
  records digital signals at high sample rates.
- **libusb** and **hidapi** — two Python-accessible ways to drive a
  USB device directly. libusb talks to raw endpoints; hidapi goes
  through the OS's HID framework (which matters on macOS).
- **Bun + TypeScript** — for the production CLI. Single-binary,
  ergonomic for humans and agents.
- **Parallels Windows 11 ARM** and **ETW** (Event Tracing for Windows,
  the kernel's built-in instrumentation) — for watching the vendor
  exe from the Windows side.

Plan: pick whichever tool was cheapest for each question.

## 4. The first big win — decrypting `.sfw`

The first thing Claude Code and I pointed at was the `.sfw` firmware
files. Axon publishes four of them — Servo Mode and Modified CR for
each of Mini and Max. They're ~17 KB each and look random in a hex
editor. I wanted to know their format before touching any hardware.

I asked Claude Code to pull the vendor exe apart with Ghidra and look
for anything AES-shaped. The agent wrote a Jython script that ran under
Ghidra's headless analyzer, found the `"Error 1030: Firmware is
incorrect."` string, walked back from the cross-reference to the
function that emits it, force-disassembled the prologue, and decompiled
a six-thousand-byte firmware upload handler plus every direct callee
into [`research/static-analysis/ghidra_out/`](../research/static-analysis/ghidra_out/).
Inside: a class `TXAes` with methods `AESEncFile`, `AESDecFile`,
`SetKeyLen`, clearly wrapping the Brian Gladman AES reference
implementation (the giveaway is a 256-entry uint32 S-box and a 1 KB
companion table).

`TXAes` doesn't have a `SetKey` method — the key is passed as a pointer
directly into `AESDecFile`. We walked the upload handler looking for
whatever buffer gets passed in. At VA `0x00406b27`:

```asm
push    0x10                 ; count = 16
push    0x54                 ; fill byte = 0x54 ('T')
lea     eax, [ebp - 0x300]   ; dest = key buffer
push    eax
call    FillChar             ; memset
```

That's... a `memset(key_buf, 0x54, 16)`. The AES key is sixteen copies
of the ASCII letter `'T'` — `"TTTTTTTTTTTTTTTT"`. I stared at that
before believing it, and asked Claude to double-check for any other
writes to that stack buffer. There were none. The key is unconditionally
sixteen 'T's.

Ten minutes of Python later I had a decrypter. The first 16 bytes of
each `.sfw` are AES-128-ECB with the 'T' key; they decrypt to a header
`[uint32_le payload_length][12 × 'x']`. The rest is AES-128-CBC with
the same key and IV=0. The plaintext is 7-bit ASCII containing a
handshake line, thirteen sector-erase commands, and several hundred
standard Intel HEX records terminated by `:00000001FF`. Every checksum
valid. The firmware inside is a small 8051-family MCU image, ~6 KB,
loaded at flash `0x0400..0x1C50`. Full write-up and reproduction
commands are in
[`research/session-notes/findings-raw.md`](../research/session-notes/findings-raw.md).

First problem solved, zero hardware involved.

## 5. Probing USB from the host

I plugged the dongle into my Mac and looked at System Information:

```
Product:        USBBootloader V1.3
Manufacturer:   Stone Laboratories inc.
Vendor ID:      0x0471   (Philips Semiconductor / NXP)
Product ID:     0x13AA
Speed:          12 Mb/s  (USB 1.1 full-speed)
```

VID `0x0471` is NXP, and `"USBBootloader V1.3"` is the string a stock
NXP LPC bootloader example presents. The dongle is an LPC MCU running
a vendor-rebadged bootloader firmware. Critically: it's a **HID-class
device**, not a USB-to-serial bridge. I'd initially assumed CDC
serial, but static analysis proved otherwise — the exe uses JVCL's
`TJvHidDeviceController` and calls `HidD_*` / `WriteFile` / `ReadFile`
on a HID file handle. No COM port, no baud rate, no UART.

Next: capture the USB traffic between the exe and the dongle. On
Windows you'd use USBPcap + Wireshark, but in my Parallels Windows 11
ARM the USBPcap kernel-mode filter driver is x64-only. Hour wasted
before I accepted that path was closed.

Plan B: **ETW**. You drive it with `logman` and `tracerpt`. Claude
Code scripted this up (traces in
[`research/etw-traces/`](../research/etw-traces/)) and it worked, but
once decoded the output disappointed: ETW logs **URB headers**
(function codes, directions, byte counts) but *not* the payload bytes.
I could see the vendor exe firing URBs at the dongle, but not what
was in them.

That's when I realized I'd been looking at the wrong side of the
problem. The interesting bytes aren't on the USB bus between the PC
and the dongle. They're on the **3-wire cable between the dongle and
the servo**.

## 6. Saleae on the servo wire

A Saleae Logic 8 is a USB logic analyzer with eight channels. Clip a
lead onto a wire, tell its software (Logic 2) what kind of signal to
expect, and it records edges at up to 100 MS/s. I opened the dongle's
3-wire connector and clipped Channel 0 to the signal wire.

I had no idea what baud rate the servo used, but 8051-family micros
almost all use one of a handful of boilerplate baud rates: 9600,
19200, 38400, 57600, 115200. Logic 2 has an **Async Serial** analyzer
that turns UART edges into bytes. I started at 9600, captured a Read
cycle from the vendor exe, and immediately got clean-looking bytes.
First hex dump of the wire:

```
t= +3.629807s  len=  8  ff ff 01 04 cd 00 3b f2
t= +3.639274s  len= 65  ff ff 01 3d 00 3b d0 0b f6 82 82 80 03 00 3c 00 50 10 ...
```

Two things snapped into focus. First: the `FF FF` preamble and the
structure were unmistakably **Dynamixel v1 protocol** — a very widely
used smart-servo framing originally from Robotis:

```
FF FF <ID> <LEN> <INSTR|ERR> <params...> <CHKSUM>
```

where `CHKSUM` is the bitwise NOT of the sum of everything from `ID`
to the last param byte. Second: the `INSTR` field in the host→servo
frame was `0xCD` — the *exact same byte* the vendor exe had been
sending in `tx[1]` of its HID output report. The dongle wasn't speaking
some proprietary framing; it was taking the HID command byte and
forwarding it as the Dynamixel `INSTR`. The dongle, I suspected, was a
transparent proxy.

I captured a Write cycle too, same story — the `0xCB` write opcode
appeared on the wire as `0xCB` `INSTR`. All checksums correct. I wrote
a little decoder
([`research/static-analysis/decode_saleae_csv.py`](../research/static-analysis/decode_saleae_csv.py))
that eats the Logic 2 CSV export and reconstructs and validates frames.
Both captures are preserved in
[`research/saleae-captures/`](../research/saleae-captures/).

For the first time in the project, I had **ground truth**. Whatever
the dongle did next, I could always cross-check by watching the wire.

## 7. The libusb detour

Here's where I was confidently, completely wrong for about a day.

I wanted to drive the dongle myself from Python. Two reasonable
choices: **hidapi** (talks through the OS's HID framework) or
**libusb** (talks to raw USB endpoints). I started with hidapi. Tiny
script: open the device by VID/PID, build a 64-byte output report with
`tx[0]=0x04, tx[1]=0x8A` (the identify opcode), write it, read 64
bytes back, check `rx[1]==0x01, rx[2]==0x00`.

First attempt: PRESENT. Second, 300 ms later: PRESENT. Third: `rx[2]
= 0xFA`. Fourth: `rx[2] = 0xFA`. Forever `rx[2] = 0xFA`.

Bizarre. The identify worked a few times and then the dongle started
reporting "no servo," even though the servo was definitely still
connected. Closing and reopening the device didn't help. Unplugging
and replugging the *dongle* did. I concluded — incorrectly — that
hidapi was broken for this device and decided to bypass the HID stack
entirely with libusb.

On macOS, libusb plus a HID-class device is a nightmare. IOKit's
`IOHIDFamily` kernel extension **owns** any HID interface as soon as
it enumerates, and does not let unprivileged userspace libraries
claim the interface. The fix is `sudo`. I added a NOPASSWD sudoers
rule scoped to my venv's Python so I wouldn't have to type a password
every run — that rule is preserved in
[`research/sudoers/`](../research/sudoers/) as a historical curiosity.
It is no longer needed.

With sudo working, the first libusb test succeeded... and then
decayed into `0xFA` within seconds. Same bug, different transport.

This was the moment I should have stopped and thought harder. I did
not. I wrote another script. Then another. Seven in total, preserved
in [`research/python-tests/`](../research/python-tests/) with a
per-script [README](../research/python-tests/README.md). I kept
tweaking timing, buffer draining, and presence-polling strategies in
search of a race condition that didn't exist.

Test 6 is where I found the footgun. `dev.reset()` in libusb sends a
USB bus reset — a sledgehammer that re-enumerates the device and
clears stuck state. I was calling it between experiments to "get a
clean dongle." What I discovered by watching the Saleae during Test 6
is that **after `dev.reset()`, the dongle emits zero bytes on the
wire**. Not wrong bytes. Not garbled. Zero. I could fire `0xCD`
commands at it and HID would happily acknowledge them, but the dongle
never actually spoke to the servo:

```
dongle before dev.reset():  FF FF 01 04 CD 00 3B F2  <-- wire bytes present
dongle after dev.reset():   (silence — nothing on the wire for minutes)
```

The dongle had a state machine I hadn't known about. A USB bus reset
put it into what I'd later call "cold state": USB interface still
alive, HID reports still going through, but the internal dongle-to-servo
path dead until the dongle saw a fresh **physical plug event** on
either the USB side or the 3-wire side. Software could not recover.

*That* was the bug I'd been chasing all day, and it had nothing to do
with hidapi versus libusb. Every "let's make sure the device is in a
clean state" step I'd added was unwittingly driving the dongle colder.
The handful of successful reads I'd been seeing were the ones that
happened before any of my recovery logic had fired.

Once I saw it, I stopped trying to work around the state machine and
started respecting it: plug in the dongle, plug in the servo *in that
order*, then run the experiment top-to-bottom in one invocation, no
`dev.reset()`, no re-enumerating. Scripts started working reliably.

## 8. The plug-in order rule

The second piece of the puzzle came from an observation I'd made while
trying to prime the dongle through Parallels: in the Parallels GUI,
disconnecting and reconnecting the device behaves like a physical
unplug, and that's *how* you prime the dongle.

Extended: **the order matters**. If I plugged the dongle into USB
*after* the servo was already on the 3-wire connector, the dongle came
up cold. If I plugged the dongle in *first*, then connected the servo,
the dongle primed and the servo appeared. This isn't in any
documentation. It's a quirk of the dongle's firmware, and the vendor
software hides it behind the "please unplug and replug" dialog it pops
up whenever something goes sideways. Once I knew the rule, I put a
big "replug now" message at the top of every script.

## 9. The dual capture — the moment it clicked

With the state machine understood and no more `dev.reset()` calls, I
was ready to prove the big claim: **the dongle is a transparent proxy.
The HID command bytes I send are the exact bytes that end up on the
wire.**

The experiment was a dual capture. One side: a Python libusb script
firing identify + `0xCD` read, hex-dumping HID replies. Other side:
the Saleae recording the wire simultaneously. If the claim was right,
the wire bytes would match the HID bytes plus a Dynamixel wrapper.

Script:
[`research/python-tests/axon_libusb_test7.py`](../research/python-tests/axon_libusb_test7.py).
Capture:
[`research/saleae-captures/dual_test7_623.csv`](../research/saleae-captures/dual_test7_623.csv).
Result:

```
HID tx: 04 CD 00 3B 00 00 00 00 ... (64 bytes)
                    ^^ length = 0x3B
                 ^^ addr     = 0x00
              ^^ cmd         = 0xCD (read)
           ^^ report id      = 0x04

Wire:   FF FF 01 04 CD 00 3B F2
              ^^ id = 0x01
                 ^^ len = 4
                    ^^ instr = 0xCD
                       ^^ ^^ params (addr, len)
                             ^^ checksum

HID rx: 04 01 00 00 3B 3B D0 0B F6 82 82 80 03 00 3C 00 50 10 ...
                    ^^ 59 data bytes follow
                 ^^ length echo
              ^^ addr echo
           ^^ status_lo = 0x00 OK
        ^^ status_hi = 0x01 OK

Wire:   FF FF 01 3D 00 3B D0 0B F6 82 82 80 03 00 3C 00 50 10 ...
                    ^^ 59 data bytes follow (bit-for-bit identical to HID rx[5..])
```

The 59 data bytes at `rx[5..64]` on the HID side are byte-for-byte
identical to the 59 data bytes on the wire. The dongle is a relay: it
takes my HID command, wraps it in Dynamixel framing, puts it on the
wire, waits for the servo's reply, strips the wrapper, and hands me
back the raw bytes. The full 95-byte config block is just two of these
reads glued together (59 + 36 = 95).

That was the moment it clicked. No secret handshake, no proprietary
anything. The dongle was a pipe.

## 10. The "wait, do we need libusb?" moment

At this point I had a libusb script that worked, a sudoers rule to
make it work without a password prompt, and a clear mental model of
the protocol. Then I thought: *if the bug was never about the
transport, does hidapi still "not work"? Or did I misdiagnose it back
in section 7?*

I wrote a five-minute retry script,
[`research/python-tests/axon_hid_test_probe.py`](../research/python-tests/axon_hid_test_probe.py).
No libusb, no `dev.reset()`, no sudo. Just hidapi, the same identify-
and-read sequence as test 7, and a byte-for-byte compare against the
known-good wire reply. Ran it unprivileged on a freshly plugged
dongle:

```
[hid] enumerate(0x0471, 0x13aa) -> 1 device(s)

=== identify x3 @ 300 ms ===
  poll 1: PRESENT  rx[:8]=04010000033f0108
  poll 2: PRESENT  rx[:8]=04010000033f0108
  poll 3: PRESENT  rx[:8]=04010000033f0108

=== read chunk 0 (0xCD addr=0 len=0x3B) ===
  0x00  04 01 00 00 3b 3b d0 0b f6 82 82 80 03 00 3c 00  ....;;..........
  0x10  50 10 00 00 c8 09 dc dc dc 29 21 1d 19 14 00 3c  P..........)!..<
  0x20  00 3c 00 3c 00 00 00 00 00 01 e3 c0 00 50 00 50  .<.<.........P.P
  0x30  00 50 00 00 00 16 0a 16 00 00 78 32 64 50 50 64  .P........x2dPPd

  [with report-id prefix] offset=5: 59/59 bytes match

=> PASS: hidapi identified the device and read chunk 0 correctly.
```

First try. Three identifies all PRESENT, full 59/59 byte match on
chunk 0. hidapi worked perfectly, was never broken, and the original
`0xFA forever` I'd seen at the start was the same state-decay pattern
I'd spent a day rediscovering through libusb.

The entire libusb detour was a misdiagnosed protocol bug.

I spent the next hour deleting things. Sudoers rule, gone.
`dev.reset()` calls, gone. libusb imports, gone. What was left was a
tiny, sudo-free, cross-platform transport.

## 11. Building the CLI

The production client is in [`axon/`](../axon/). Stack:

- **Bun** — fast TypeScript runtime with built-in bundler, produces
  single-file standalone binaries for Mac, Linux, and Windows.
- **TypeScript** — types for protocol constants, transport interface,
  servo catalog.
- **node-hid** — Node.js binding for hidapi, works under Bun.
- **Biome** — all-in-one formatter/linter.
- **Vitest** — unit tests.

The architecture is deliberately boring. A `DongleHandle` interface in
[`axon/src/driver/transport.ts`](../axon/src/driver/transport.ts) has
three methods: `write`, `read`, `release`. The protocol layer in
[`axon/src/driver/protocol.ts`](../axon/src/driver/protocol.ts) only
sees that interface, with no compile-time dependency on node-hid — so
tests inject a `MockDongle` and validate the protocol without touching
hardware. The real transport is in
[`axon/src/driver/hid.ts`](../axon/src/driver/hid.ts) and does nothing
clever: open by VID/PID, write 64-byte output reports, read 64-byte
input reports. No `dev.reset()` anywhere — node-hid doesn't even
expose a reset primitive, so the footgun is impossible by construction.

The v1.0 command surface, spec'd in
[`docs/CLI_DESIGN.md`](CLI_DESIGN.md):

```
axon status                 # adapter + servo presence, model id, mode
axon monitor                # live 300 ms presence polling
axon read                   # pretty / --json / --svo / --hex
axon write --from cfg.svo   # diff, confirm, write, verify
axon get <param>            # named parameter with unit conversion
axon set <param> <value>    # read-modify-write with diff-confirm
axon mode set <name>        # flash a known firmware mode
```

Today, `status`, `monitor`, `read`, and `write` are working. `get` /
`set` with named parameters and `mode set` are the remaining v1.0
items. There's also an [agent skill](../.claude/skills/) so other
Claude Code instances can drive the CLI themselves — the CLI exists
because an agent helped me reverse-engineer the device, and now the
agent knows how to use the CLI it helped build.

## 12. Reflection: reverse-engineering closed systems

A few things that would have saved me time.

**Dynamic capture beats static reading for ambiguous questions.**
Static analysis with Ghidra is incredible for "what does this code
do if I look at it directly" — like extracting an AES key from a
fixed memset, or enumerating HID command bytes from a decompiled
dispatcher. It is terrible for "why doesn't my client work," because
that's usually a state-machine issue that doesn't live in the
instructions at all. A ten-minute Saleae capture of the vendor exe
told me more than a week of decompiler grep could have.

**Respect the protocol's state machine before you try to control the
protocol.** The whole libusb detour happened because I assumed the
transport was stateless and I could recover from bad states with
`dev.reset()`. The dongle had a physical-plug-driven state machine;
software was powerless. Every hardware protocol has one of these
hiding somewhere. When your client works once and then stops, the
next question is always *what state transition just happened that I
wasn't paying attention to?*

**The transport layer is rarely the actual problem.** I spent a day
convinced hidapi was broken. hidapi was fine. The test that would
have told me so was a five-line script I only wrote *after* finishing
the libusb work, because I didn't trust my own assumptions until a
ground-truth capture forced me to. Next time: ground truth first,
transport assumptions second.

**Tooling matters more than smarts.** The most valuable piece of
equipment in this project was the Saleae. Not because it's magical —
it's a commodity logic analyzer — but because it gave me an
independent, un-lying source of truth about what was actually
happening at the wire.

## 13. Reflection: working with Claude Code on a project like this

The point of the exercise was partly to answer: *how does an agent
like Claude Code change the calculus of a project like this?*

**Where the agent was strong.** Reading decompilation. Parallel
exploration ("go look at X, Y, Z in Ghidra at once"). Writing small
diagnostic scripts on demand. Cataloguing findings for later reference.
Producing initial scaffolding for the CLI, tests, catalog schema, CI.
All the "I know what I want, I just don't want to type it" work. A
human alone would have spent a week on what we got through in a day
or two.

**Where the agent was weak.** The libusb detour. Claude Code committed
hard to "hidapi is broken" right alongside me and we both kept
reinforcing it for a day. In retrospect the agent should have been
pushing back with "wait, we never actually proved that — let's write
the five-minute test," and I should have been listening harder.
There's also context window pressure on long projects: we'd
occasionally have to rebuild mental state across sessions, which a
human collaborator doesn't have as sharply. The work-around is
aggressive note-taking into living documents in the repo — which is
exactly what [`research/`](../research/) is.

**Who did what.** *I* supplied the hardware, ran the Saleae captures
in Logic 2, replugged the servo every time the dongle went cold, made
the architectural calls (Bun, Electrobun as the GUI target, MIT
license, what features belonged in v1 vs. v1.1), and insisted on the
dual-capture experiment that finally broke the impasse. *Claude Code*
drove Ghidra headless and read the decompilation, wrote all seven
libusb test scripts and the hidapi retry, decoded the wire captures,
reconstructed the 95-byte config block layout, built the CLI
scaffolding and the transport-abstraction refactor, set up the test
infrastructure, wrote the unit tests, and drafted most of the docs.
Neither half alone would have finished this in any reasonable time.
The research-experiment answer is: with a good agent, a single
developer can take on a reverse-engineering project of this shape and
actually ship it.

## 14. What's next

The v0.1 CLI — status, monitor, read, write — is working today. The
v1.0 items on the
[milestone](https://github.com/caryden/servo-programmer/milestones)
are named parameters with unit conversion, firmware mode flashing,
cross-compiled standalone binaries, and a polished `axon` skill for
other Claude Code users.

One request: **if you have an Axon Max, Mini, or Micro and you'd run
the CLI against it and send me the output, I'd like to add your servo
to [`data/servo_catalog.json`](../data/servo_catalog.json).** I've
only tested on my own Mini. Open an issue on
[`caryden/servo-programmer`](https://github.com/caryden/servo-programmer/issues).

If you have a different closed USB device you'd like to try
reverse-engineering, I'd suggest starting the same way I did:
**get ground truth first**. Find a logic analyzer or USB sniffer that
can tell you, independently of any code you write, what the wire
actually does. Everything else gets easier once you have that.

## 15. Acknowledgments

Thanks to:

- **Axon Robotics** for making cool hardware — this project exists
  because the servos themselves are genuinely good.
- **The FTC robotics community** for the use case and the enthusiasm.
- **Saleae** for an automation API that made the dual-capture
  experiment trivial, and a logic analyzer that just works.
- **Ghidra** for the decompiler, and the Jython scripting API that
  let the agent drive it headless.
- **The libusb, hidapi, node-hid, and Bun maintainers** for the open
  infrastructure.
- **Anthropic / Claude Code** for the agent that drove most of the
  hands-on work — and that made the whole "let me see how far I can
  get" experiment possible in the first place.
