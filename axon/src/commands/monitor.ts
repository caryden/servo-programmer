/**
 * `axon monitor` — live presence polling.
 *
 * Polls every 300 ms and prints one line per state transition.
 * Ctrl-C to stop.
 *
 * Human output is clean: "no adapter", "adapter connected, no servo",
 * "servo connected". Debug detail (rx bytes, OS errors) is shown
 * only when AXON_DEBUG=1.
 */

import type { GlobalFlags } from "../cli.ts";
import { isDonglePresent, openDongle } from "../driver/hid.ts";
import { identify } from "../driver/protocol.ts";
import type { DongleHandle } from "../driver/transport.ts";
import { ExitCode } from "../errors.ts";

type State = "no-adapter" | "adapter-only" | "servo-present";

const POLL_INTERVAL_MS = 300;

function isDebug(): boolean {
  return process.env.AXON_DEBUG === "1";
}

function stamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** Human-friendly state label. */
function stateLabel(s: State): string {
  if (s === "no-adapter") return "no adapter";
  if (s === "adapter-only") return "adapter connected, no servo";
  return "servo connected";
}

function logTransition(flags: GlobalFlags, from: State, to: State, detail?: string): void {
  if (flags.json) {
    process.stdout.write(
      JSON.stringify({
        t: new Date().toISOString(),
        event: "transition",
        from,
        to,
        detail: detail ?? null,
      }) + "\n",
    );
  } else {
    const debugSuffix = isDebug() && detail ? `  ${detail}` : "";
    process.stdout.write(`[${stamp()}] ${stateLabel(to)}${debugSuffix}\n`);
  }
}

export async function runMonitor(flags: GlobalFlags): Promise<number> {
  let handle: DongleHandle | null = null;
  let state: State = "no-adapter";

  if (!flags.json) {
    process.stdout.write(`[${stamp()}] monitoring (Ctrl-C to stop)\n`);
  }

  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });

  while (!stopping) {
    let newState: State = state;
    let detail: string | undefined;

    try {
      if (handle === null) {
        if (!isDonglePresent()) {
          newState = "no-adapter";
        } else {
          try {
            handle = await openDongle();
          } catch (e) {
            newState = "no-adapter";
            detail = (e as Error).message;
          }
        }
      }

      if (handle !== null) {
        const id = await identify(handle);
        newState = id.present ? "servo-present" : "adapter-only";
      }
    } catch (e) {
      if (handle !== null) {
        try {
          await handle.release();
        } catch {}
        handle = null;
      }
      newState = "no-adapter";
      detail = (e as Error).message;
    }

    if (newState !== state) {
      logTransition(flags, state, newState, detail);
      state = newState;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (handle !== null) {
    try {
      await handle.release();
    } catch {}
  }
  if (!flags.json) {
    process.stdout.write(`\n[${stamp()}] stopped\n`);
  }
  return ExitCode.Ok;
}
