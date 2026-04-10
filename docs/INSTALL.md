# Installing `axon`

`axon` is a single-binary CLI for the Axon Robotics servo programmer
adapter. It runs unprivileged on Linux, macOS, and Windows — no
`sudo`, no kernel driver, no udev rules on most distros.

Pick the install method that matches how you work.

## TL;DR

| You are on…                    | Do this                                                                                          |
|-------------------------------|--------------------------------------------------------------------------------------------------|
| macOS (Apple Silicon or Intel)| `brew install caryden/axon/axon` *(once the tap ships)*                                          |
| Linux (x64 or arm64)          | Download `axon-linux-<arch>`, `chmod +x`, put it on `$PATH` *(see "Direct download" below)*      |
| Windows (x64)                 | Download `axon-windows-x64.exe`, put it on `%PATH%`                                              |
| "I already have a Node toolchain" | `npm install -g @caryden/axon` *(once published)*                                            |
| "I already have a Bun toolchain"  | `bunx @caryden/axon` *(once published; runs without installing)*                             |
| "I'm in CI and need a one-liner"  | `curl -fsSL https://raw.githubusercontent.com/caryden/servo-programmer/main/scripts/install.sh \| bash` *(once the script ships)* |

## What you need on the target machine

- A USB port.
- The Axon programmer adapter (VID `0x0471`, PID `0x13AA`, shows
  up as *"USBBootloader V1.3"* in system USB listings).
- On **Linux**, most distros grant HID access via hidraw out of the
  box. If you hit a `Permission denied` on the device node, add a
  udev rule:

  ```udev
  # /etc/udev/rules.d/99-axon.rules
  SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0471", ATTRS{idProduct}=="13aa", MODE="0660", TAG+="uaccess"
  ```

  Then reload udev:

  ```bash
  sudo udevadm control --reload-rules && sudo udevadm trigger
  ```

- On **macOS**, `axon` uses the IOKit HID Manager. No permissions to
  configure. First-run Gatekeeper may flag the downloaded binary as
  "unidentified developer" — `xattr -d com.apple.quarantine ./axon`
  clears that, or right-click → Open in Finder once and accept.
- On **Windows**, `axon` uses HID.dll. No drivers to install.

## Direct download (all platforms)

1. Go to the [releases page](https://github.com/caryden/servo-programmer/releases/latest).
2. Download the asset that matches your platform:

   | Platform                  | Asset                   |
   |---------------------------|-------------------------|
   | Linux x64                 | `axon-linux-x64`        |
   | Linux arm64               | `axon-linux-arm64`      |
   | macOS arm64 (M-series)    | `axon-darwin-arm64`     |
   | macOS x64 (Intel)         | `axon-darwin-x64`       |
   | Windows x64               | `axon-windows-x64.exe`  |

3. Verify the checksum (each asset has a matching `.sha256`):

   ```bash
   shasum -a 256 -c axon-darwin-arm64.sha256
   ```

4. Make it executable and drop it on `$PATH`:

   ```bash
   chmod +x axon-darwin-arm64
   sudo mv axon-darwin-arm64 /usr/local/bin/axon
   axon --version
   ```

   On Windows, put `axon-windows-x64.exe` somewhere on `%PATH%`
   (e.g. `C:\Users\<you>\bin\axon.exe`).

## Homebrew (macOS / Linuxbrew)

Tap the formula and install:

```bash
brew install caryden/axon/axon
```

This is the recommended install on macOS because it handles the
Gatekeeper signing hand-off and updates cleanly with `brew upgrade`.

> The Homebrew tap at `caryden/axon` is **not yet published**. See
> [issue #TBD](https://github.com/caryden/servo-programmer/issues)
> for the tap setup plan.

## npm / Bun (for Node/Bun users)

If you already have a JS toolchain you can grab `axon` from npm:

```bash
# Global install
npm install -g @caryden/axon

# Or, with Bun
bun install -g @caryden/axon

# Or run once without installing
bunx @caryden/axon status
```

> Publishing to npm is **not yet done**. The npm path is useful
> mainly for people who already use the Node/Bun ecosystem and
> don't want to download a binary by hand.

## Shell installer (Linux / macOS CI)

For CI and for people who just want a one-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/caryden/servo-programmer/main/scripts/install.sh | bash
```

The installer:

1. Detects your platform and arch
2. Downloads the latest release binary from GitHub
3. Verifies the SHA256 against the matching sidecar
4. Installs to `${AXON_INSTALL_DIR:-/usr/local/bin}/axon`
5. Prints a confirmation with the installed version

> The installer script is **not yet written**. See
> [issue #TBD](https://github.com/caryden/servo-programmer/issues)
> for the plan.

## Scoop (Windows, planned)

Once the Scoop bucket lands, Windows users can:

```powershell
scoop bucket add axon https://github.com/caryden/scoop-axon
scoop install axon
```

## Build from source

If you want the absolute latest code or you're working on `axon`
itself, clone and build:

```bash
git clone https://github.com/caryden/servo-programmer.git
cd servo-programmer/axon
bun install
bun run build
./bin/axon --version
```

This requires [Bun](https://bun.sh) installed on your machine. On
Linux you'll also need `libudev-dev` (Debian/Ubuntu) or `libudev`
(Fedora/Arch) for the `node-hid` native addon to compile.

## Verifying the install

After installing via any method, run:

```bash
axon --version
axon status
```

`axon status` prints the state of the adapter and servo. A
successful run with no hardware attached looks like:

```
adapter  disconnected
servo    unknown
state    no_adapter
hint:    Plug in the Axon servo programmer adapter.
```

With the adapter and a servo plugged in:

```
adapter  connected
servo    present
state    servo_present
model    SA33****  (Axon Mini)
```

## Uninstalling

| Install method      | Uninstall command                              |
|---------------------|------------------------------------------------|
| Direct download     | `rm /usr/local/bin/axon`                       |
| Homebrew            | `brew uninstall caryden/axon/axon`             |
| npm                 | `npm uninstall -g @caryden/axon`               |
| Bun                 | `bun remove -g @caryden/axon`                  |
| Shell installer     | `rm "$(which axon)"`                           |
| Scoop               | `scoop uninstall axon`                         |

If you added the Linux udev rule above, remove it to clean up:

```bash
sudo rm /etc/udev/rules.d/99-axon.rules
sudo udevadm control --reload-rules
```
