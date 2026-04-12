---
name: axon-cli-safety
description: Safely drive the Axon `axon` CLI against attached servos. Use when you need to inspect hardware, read or write configs, flash firmware modes, handle recovery flashing, or choose the least risky command sequence for a connected adapter/servo.
---

# Axon CLI Safety

Use this skill when operating the Axon CLI on real hardware or when preparing an agent to do so.

## Default workflow

1. Start with `axon --json doctor` to separate USB/HID, adapter, servo, and config issues.
2. Use `axon status` or `axon monitor` for a quick presence check.
3. Read before you write. Prefer `axon read --json` or `axon read --svo` to confirm the current state.
4. For named parameters, prefer `axon get <param>` and `axon set <param> <value>` over raw config byte edits.
5. For flashing, require an explicit `.sfw` file path unless the catalog/search-path flow is already established.
6. Use `--yes` only when the user has already confirmed the exact operation.

## Safety rules

- Treat `write` and `mode set` as destructive until proven otherwise.
- Do not guess firmware files. If the file is not explicit, ask where it should come from or where to search.
- If `axon mode set` fails because no servo is detected, suggest recovery mode only when the user has a known-good firmware file or a catalog target.
- Prefer `--recover` only for bootloader recovery cases. It skips normal identity checks, so the file/model choice must be correct.
- After config or firmware changes, re-run `axon status` or `axon read` and compare the result to the expected state.

## Output handling

- Prefer `--json` for scripted use.
- Branch on `category`, not human text, when the command supports JSON output.
- When `doctor` reports a failure, fix the earliest failing check rather than jumping straight to flashing.

## Good prompts for the agent

- "Check the adapter and servo, but do not write anything."
- "Read the current config and tell me whether it matches the catalog."
- "Flash this exact `.sfw` file to servo mode."
- "Try recovery flashing because the servo is in bootloader mode."
