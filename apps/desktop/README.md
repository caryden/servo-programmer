# Electrobun App

This is the desktop Axon Servo Programmer built with Electrobun. It is
still best understood as a side experiment: the goal was to prove that
the shared UI and shared core logic could survive a native desktop
packaging path, not to replace the CLI or web app as the primary
surface.

## Why this shape

The browser app in [`../web/`](../web/) proved that Chromium can talk
to the adapter through WebHID. That is not the right desktop boundary:

- Safari/WebKit does not expose the same WebHID path.
- Electrobun uses the platform native webview by default.
- The desktop app should keep HID and firmware flashing in the Bun main
  process, not in the renderer.

So the desktop app reuses the shared UI, but routes all hardware work
through Electrobun RPC into Bun.

## Architecture

- [`../../packages/ui/`](../../packages/ui/) for the shared programmer UI
- [`../../packages/transport-nodehid/`](../../packages/transport-nodehid/) for desktop HID access
- [`../../packages/core/`](../../packages/core/) for shared protocol,
  flash, catalog, and `.sfw` handling

## What it does

- shows runtime and transport info
- watches visible Axon adapters via `node-hid`
- auto-connects to the adapter
- identifies the attached servo and reads the current setup
- applies same-mode config changes with read-back verification
- switches between Servo and CR by flashing bundled firmware,
  reconnecting, writing setup, and verifying
- supports native desktop file actions for:
  - load `.axon` and `.svo`
  - save `.axon`
  - export `.svo`

## Run it

From the repo root:

```bash
cd /Users/caryden/github/servo-programmer
bun install
cd /Users/caryden/github/servo-programmer/apps/desktop
bun run start
```

## Package it

To build a production desktop artifact locally on macOS:

```bash
cd /Users/caryden/github/servo-programmer/apps/desktop
bun run clean
bun run package
```

Current stable build output lands in:

- `apps/desktop/artifacts/stable-macos-arm64-AxonServoProgrammer.dmg`

The DMG is the end-user install path.

## Notes

- Keep the adapter on the host OS, not inside a VM such as Parallels.
- HID and flashing stay in the Bun main process; the renderer only owns
  UI state.
- Bundled firmware files are copied into the desktop build under
  `app/downloads/`.
