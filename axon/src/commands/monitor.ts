/**
 * `axon monitor` — live presence TUI.
 *
 * Shows a colored status bar that updates in place every 300 ms.
 * Ctrl-C to stop.
 */

import { findModel, loadCatalog } from "../catalog.ts";
import type { GlobalFlags } from "../cli.ts";
import { isDonglePresent, openDongle } from "../driver/hid.ts";
import { identify, modelIdFromConfig, readFullConfig, type ServoMode } from "../driver/protocol.ts";
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
  let cachedModelName: string | null = null;
  const isTTY = process.stdout.isTTY === true;

  if (isTTY && !flags.json) process.stdout.write(HIDE_CURSOR);

  let stopping = false;
  const cleanup = () => {
    stopping = true;
    if (isTTY && !flags.json) process.stdout.write(SHOW_CURSOR);
  };
  process.on("SIGINT", cleanup);

  while (!stopping) {
    let adapterPresent = false;
    let servoName: string | null = null;
    let mode: string | null = null;

    try {
      if (handle === null) {
        cachedModelName = null;
        if (isDonglePresent()) {
          try {
            handle = await openDongle();
          } catch {
            // claim failed — retry next tick
          }
        }
      }

      if (handle !== null) {
        adapterPresent = true;
        try {
          const id = await identify(handle);
          if (id.present) {
            mode = modeLabel(id.mode);
            // Read model name once, cache it for subsequent ticks.
            if (cachedModelName === null) {
              try {
                const config = await readFullConfig(handle);
                const modelId = modelIdFromConfig(config);
                const catalog = loadCatalog();
                const model = findModel(catalog, modelId);
                cachedModelName = model?.name ?? modelId;
              } catch {
                cachedModelName = "servo";
              }
            }
            servoName = cachedModelName;
          } else {
            cachedModelName = null;
          }
        } catch {
          try {
            await handle.release();
          } catch {}
          handle = null;
          adapterPresent = false;
          cachedModelName = null;
        }
      }
    } catch {
      if (handle !== null) {
        try {
          await handle.release();
        } catch {}
        handle = null;
      }
      cachedModelName = null;
    }

    if (flags.json) {
      const obj = { adapter: adapterPresent, servo: servoName, mode };
      const line = JSON.stringify(obj);
      if (line !== lastLine) {
        process.stdout.write(line + "\n");
        lastLine = line;
      }
    } else {
      const bar = renderStatusBar({
        adapter: adapterPresent,
        servoName,
        modeName: mode,
      });
      if (bar !== lastLine) {
        if (isTTY && lastLine) {
          process.stdout.write(`\r${CLEAR_LINE}`);
        }
        process.stdout.write(isTTY ? `\r${bar}` : `${bar}\n`);
        lastLine = bar;
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
