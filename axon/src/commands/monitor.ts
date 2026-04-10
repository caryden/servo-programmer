/**
 * `axon monitor` — live presence polling.
 *
 * Polls every 300 ms (same cadence as the vendor exe) and prints
 * one line per state transition. Ctrl-C to stop.
 *
 * States:
 *   no-adapter    — no Axon dongle enumerated on USB
 *   adapter-only  — dongle present, servo reports absent (rx[2]!=0)
 *   servo-present — dongle present, servo reports present
 */

import type { GlobalFlags } from "../cli.ts";
import { isDonglePresent, openDongle } from "../driver/hid.ts";
import { identify } from "../driver/protocol.ts";
import type { DongleHandle } from "../driver/transport.ts";
import { ExitCode } from "../errors.ts";

type State = "no-adapter" | "adapter-only" | "servo-present";

const POLL_INTERVAL_MS = 300;

function stamp(): string {
  return new Date().toTimeString().slice(0, 8);
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
    const suffix = detail ? `  ${detail}` : "";
    process.stdout.write(`[${stamp()}] ${from} -> ${to}${suffix}\n`);
  }
}

export async function runMonitor(flags: GlobalFlags): Promise<number> {
  let handle: DongleHandle | null = null;
  let state: State = "no-adapter";
  let lastStatusByte: number | null = null;

  if (!flags.json) {
    process.stdout.write(
      `[${stamp()}] monitor starting, polling every ${POLL_INTERVAL_MS} ms  (Ctrl-C to stop)\n`,
    );
    process.stdout.write(`[${stamp()}] initial state: ${state}\n`);
  }

  // Clean up on Ctrl-C
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });

  while (!stopping) {
    let newState: State = state;
    let detail: string | undefined;

    try {
      if (handle === null) {
        // Not currently holding the device. Try to find + claim it.
        if (!isDonglePresent()) {
          newState = "no-adapter";
        } else {
          try {
            handle = await openDongle();
            // fall through to identify in this same tick
          } catch (e) {
            // Claim failed — back off and try again next tick
            newState = "no-adapter";
            detail = `(claim failed: ${(e as Error).message})`;
          }
        }
      }

      if (handle !== null) {
        const id = await identify(handle);
        lastStatusByte = id.statusLo;
        newState = id.present ? "servo-present" : "adapter-only";
        if (newState === "adapter-only" && lastStatusByte !== 0x00) {
          detail = `(rx[2]=0x${lastStatusByte.toString(16).padStart(2, "0")})`;
        }
      }
    } catch (e) {
      // Communication with the dongle failed — release and retry
      if (handle !== null) {
        try {
          await handle.release();
        } catch {}
        handle = null;
      }
      newState = "no-adapter";
      detail = `(io error: ${(e as Error).message})`;
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
    process.stdout.write(`\n[${stamp()}] stopped by user\n`);
  }
  return ExitCode.Ok;
}
