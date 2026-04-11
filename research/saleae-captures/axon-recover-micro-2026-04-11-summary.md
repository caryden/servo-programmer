# Axon Micro recover flash capture - 2026-04-11

## Command

```bash
cd /Users/caryden/github/servo-programmer/axon
bun run src/cli.ts mode set servo --recover micro --yes
```

Result: exited 0. The CLI reported:

```text
Done. Axon Micro (SA20BHS*) is now in Servo Mode.
```

Post-flash status:

```json
{"adapter":"connected","servo":"present","category":"servo_present","mode_byte":"0x03","mode_label":"Servo Mode","model":{"id":"SA20BHS*","name":"Axon Micro","known":true,"docs_url":"https://docs.axon-robotics.com/servos/micro"}}
```

## Capture

- Device: Saleae Logic8 `CB220FE153BAA973`
- Channel: D0 on servo signal wire
- Capture rate: 10 MS/s digital
- Capture file: `research/saleae-captures/axon-recover-micro-2026-04-11.sal`
- 115200 8N1 export: `research/saleae-captures/axon-recover-micro-2026-04-11-async-115200.csv`
- 9600 8N1 export: `research/saleae-captures/axon-recover-micro-2026-04-11-async.csv`
- Raw D0 export: `research/saleae-captures/axon-recover-micro-2026-04-11-raw/digital.csv`

## Firmware

- Firmware file: `Axon Micro Servo Mode.sfw`
- SHA-256: `229bda41faff98029c0086a5e8356f05fbd563ba79b5a79502d486c0acad6b33`
- Header: `@0801SA20BHS`
- Type bytes: `08 01`
- Sector erase records: 13
- Intel HEX records: 398
- Intel HEX data bytes: 5901

## Decode Notes

The flash bootloader traffic decodes cleanly at 115200 8N1, not at the normal 9600 config-protocol rate.

Clean 115200 decode through the EOF firmware record:

- Total clean bytes through EOF: 9507
- Boot query TX: `01 02 03 04`
- Boot query RX: `56 30 2E 33 08 01`
- Boot reply text: `V0.3`
- Boot reply type bytes: `08 01`
- Key exchange: 22 byte TX challenge, 22 byte RX response
- Sector erase writes: 13 encrypted 22 byte payloads, each ACKed with `55`
- Firmware writes: 398 encrypted 22 byte Intel HEX payloads, including EOF

After EOF the servo reboots. The 115200 analyzer then reports framing-zero artifacts. The next clean protocol exchange is normal 9600 Dynamixel-style identify:

```text
20.6767771s host identify:
FF FF 01 04 8A 00 04 6C

20.6861662s servo reply:
FF FF 01 06 00 03 21 01 08 CB
```

The reply mode byte is `0x03`, confirming Servo Mode after recovery flashing.

## Comparison Target

For a future failed-servo/vendor-app recovery capture, compare:

- Whether the vendor app also switches the servo signal wire to 115200 8N1 for bootloader flash traffic.
- Boot query TX/RX, especially `V0.3` and type bytes `08 01`.
- Count of sector erase writes, firmware writes, and ACK bytes.
- The post-flash return to 9600 identify traffic.
