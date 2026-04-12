# WebHID PoC

This is a minimal browser proof-of-concept for talking to the Axon V1.3
programmer adapter over WebHID.

It answers one narrow question:

> Can a Chromium-based browser on `localhost` request the adapter, open
> it over WebHID, and exchange the same identify/read reports that the
> CLI sends over `node-hid`?

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
python3 -m http.server 8765
```

Then open:

```text
http://localhost:8765
```

## Browser constraints

- Use a Chromium-based browser such as Chrome, Edge, or Brave.
- Safari and Firefox do not currently give you a useful path here.
- If the adapter is captured by a VM such as Parallels, the browser
  will not be able to open it from the host.

## Protocol note

The production CLI writes 64-byte HID reports that include report id
`0x04` as byte 0. WebHID passes the report id separately, so this PoC
uses:

- `reportId = 0x04`
- a 63-byte payload for the rest of the report

Likewise, the input report event exposes the reply payload without the
report id byte, so the protocol offsets are shifted by `-1` relative to
the `node-hid` code.
