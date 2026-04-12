# WebHID PoC

This is a minimal browser proof-of-concept for talking to the Axon V1.3
programmer adapter over WebHID.

It answers one narrow question:

> Can a Chromium-based browser on `localhost` request the adapter, open
> it over WebHID, and exchange the same identify/read reports that the
> CLI sends over `node-hid`?

The current implementation now uses:

- [`../../packages/ui/`](../../packages/ui/) for the shared probe UI
- [`../../packages/transport-webhid/`](../../packages/transport-webhid/) for browser HID access
- [`../../packages/core/`](../../packages/core/) for shared protocol and catalog logic

## What it does

- filters for the Axon adapter (`VID 0x0471`, `PID 0x13aa`)
- opens the selected HID device
- sends the identify command (`0x8A`)
- can read the full 95-byte config block via the same two-chunk
  `0xCD` flow used by the CLI

It does **not** attempt to write config or flash firmware.

## Run it

Serve this directory from `localhost`. WebHID requires a secure context,
and `http://localhost` qualifies.

From the repo root:

```bash
cd apps/web
bun run start
```

Then open:

```text
http://localhost:8765
```

The `start` script bundles [`src/index.ts`](./src/index.ts) to
[`dist/index.js`](./dist/index.js) and then serves the app.

## Browser constraints

- Use a Chromium-based browser such as Chrome, Edge, Brave, or Arc.
- Safari and Firefox do not currently give you a useful path here.
- If the adapter is captured by a VM such as Parallels, the browser
  will not be able to open it from the host.
