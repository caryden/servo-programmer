# Electrobun PoC

This is a minimal desktop proof-of-concept for talking to the Axon V1.3
programmer adapter from an Electrobun app.

It answers one narrow question:

> Can a desktop UI built with Electrobun keep the frontend in a WebView,
> keep HID in the Bun main process, and reuse the existing Axon
> `node-hid` and protocol code to enumerate, identify, and read config?

## Why this shape

The browser PoC in [`../web/`](../web/) proved that a
Chromium browser can talk to the adapter through WebHID. That is not a
good desktop abstraction, though:

- Safari/WebKit does not give us the same WebHID path.
- Electrobun uses the platform's native webview by default.
- The desktop app should therefore treat HID as a Bun-side transport,
  not a renderer-side browser feature.

So this PoC keeps the UI browser-like but routes all hardware access
through Electrobun RPC into the Bun process.

## What it does

- shows runtime and transport info
- lists visible Axon adapters via `node-hid`
- opens the first visible adapter
- sends the identify command (`0x8A`)
- reads the full 95-byte config block via the same two-chunk `0xCD`
  flow used by the CLI

It does **not** attempt to write config or flash firmware.

## Run it

From the repo root, make sure the CLI dependencies are present:

```bash
cd /Users/caryden/github/servo-programmer
bun install
```

Then start the Electrobun app:

```bash
cd /Users/caryden/github/servo-programmer/apps/desktop
bun run start
```

## Current implementation tradeoff

This PoC now imports the shared catalog/protocol/error logic from
[`../../packages/core/`](../../packages/core/) while still using the
CLI's `node-hid` transport from [`../cli/`](../cli/). That is
an intentional halfway step:

- shared pure logic moves first
- platform transports stay where they currently live
- bigger repo reshaping can happen after the boundaries are proven
