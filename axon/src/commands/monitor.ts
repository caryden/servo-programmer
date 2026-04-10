/**
 * `axon monitor` — live presence TUI.
 *
 * Shows a colored status bar that updates in place every 300 ms.
 * Ctrl-C to stop.
 */

import type { GlobalFlags } from "../cli.ts";
import { isDonglePresent, openDongle } from "../driver/hid.ts";
import { identify, type ServoMode } from "../driver/protocol.ts";
import type { DongleHandle } from "../driver/transport.ts";
import { ExitCode } from "../errors.ts";
import { CLEAR_LINE, HIDE_CURSOR, renderStatusBar, SHOW_CURSOR } from "../util/tui.ts";

const POLL_INTERVAL_MS = 300;

function modeLabel(mode: ServoMode): string | null {
  if (mode === "servo_mode") return "Servo Mode";
  if (mode === "cr_mode") return "CR Mode";
  return null;
}

export async function runMonitor(flags: GlobalFlags): Promise<number> {
  let handle: DongleHandle | null = null;
  let lastLine = "";
  const isTTY = process.stdout.isTTY === true;

  if (isTTY && !flags.json) process.stdout.write(HIDE_CURSOR);

  let stopping = false;
  const cleanup = () => {
    stopping = true;
    if (isTTY && !flags.json) process.stdout.write(SHOW_CURSOR);
  };
  process.on("SIGINT", cleanup);

  while (!stopping) {
    let connected = false;
    let model: string | null = null;
    let mode: string | null = null;
    let detail: string | null = null;

    try {
      if (handle === null) {
        if (isDonglePresent()) {
          try {
            handle = await openDongle();
          } catch (e) {
            detail = (e as Error).message;
          }
        }
      }

      if (handle !== null) {
        connected = true;
        try {
          const id = await identify(handle);
          if (id.present) {
            mode = modeLabel(id.mode);
            // We don't read the full config every tick (too slow).
            // Model name shows after the first successful identify.
            model = "servo connected";
          }
        } catch {
          // identify failed — release and retry next tick
          try {
            await handle.release();
          } catch {}
          handle = null;
          connected = false;
        }
      }
    } catch {
      if (handle !== null) {
        try {
          await handle.release();
        } catch {}
        handle = null;
      }
    }

    if (flags.json) {
      const obj = { connected, model, mode, detail };
      const line = JSON.stringify(obj);
      if (line !== lastLine) {
        process.stdout.write(line + "\n");
        lastLine = line;
      }
    } else {
      const bar = renderStatusBar({
        connected,
        modelName: model,
        modeName: mode,
      });
      const line = bar + (detail ? `  ${detail}` : "");
      if (line !== lastLine) {
        if (isTTY && lastLine) {
          process.stdout.write(`\r${CLEAR_LINE}`);
        }
        process.stdout.write(isTTY ? `\r${line}` : `${line}\n`);
        lastLine = line;
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (handle !== null) {
    try {
      await handle.release();
    } catch {}
  }
  if (isTTY && !flags.json) {
    process.stdout.write("\n");
  }
  return ExitCode.Ok;
}
