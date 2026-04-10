/**
 * `axon status` — one-shot presence check.
 *
 * This command is designed to be *informational*: it always exits 0
 * (regardless of whether the adapter or servo is present) and never
 * throws into the top-level catch. It produces a structured
 * observation of the current state with an actionable hint for
 * every non-OK state. The hint is tailored to exactly what was
 * observed, not a generic laundry list.
 *
 * States this command can report:
 *
 *   no_adapter      — nothing on USB with the right VID/PID
 *   adapter_busy    — USB device found but HID open failed (another
 *                     process has it)
 *   adapter_stale   — HID open succeeded but the first identify was
 *                     rejected (stale handle, needs a dongle replug)
 *   no_servo        — identify worked but rx[2]=0xFA (no servo on
 *                     the wire, user needs to replug the servo)
 *   servo_present   — everything is fine; model id is reported
 *
 * In --json mode, every response includes a machine-readable
 * `category` field that an agent or script can branch on instead
 * of parsing text.
 */

import { findModel, loadCatalog } from "../catalog.ts";
import type { GlobalFlags } from "../cli.ts";
import { isDonglePresent, openDongle } from "../driver/hid.ts";
import { identify, modelIdFromConfig, readFullConfig } from "../driver/protocol.ts";
import { AxonError, type ErrorCategory, ExitCode } from "../errors.ts";

type StatusCategory =
  | "no_adapter"
  | "adapter_busy"
  | "adapter_stale"
  | "no_servo"
  | "unknown_model"
  | "servo_present";

interface StatusObservation {
  adapter: "connected" | "disconnected";
  servo: "present" | "absent" | "unknown";
  category: StatusCategory;
  hint?: string;
  servo_status_byte?: string;
  model?: {
    id: string;
    name: string | null;
    known: boolean;
    docs_url: string | null;
  };
  error?: string;
}

export async function runStatus(flags: GlobalFlags): Promise<number> {
  // ---- Phase 0: USB enumeration (cheap, no claim) --------------------------
  if (!isDonglePresent()) {
    emit(flags, {
      adapter: "disconnected",
      servo: "unknown",
      category: "no_adapter",
      hint:
        "Plug in the Axon dongle. It should enumerate as VID 0471 PID " +
        "13AA ('USBBootloader V1.3' / 'Stone Laboratories inc.').",
    });
    return ExitCode.Ok;
  }

  // ---- Phase 1: open and claim the HID handle -------------------------------
  let handle;
  try {
    handle = await openDongle();
  } catch (e) {
    // openDongle throws AxonError with a specific category
    // ("adapter_busy" if something else claimed the device, "no_adapter"
    // if it disappeared between the enumeration check and the open).
    if (e instanceof AxonError) {
      const cat = e.category;
      emit(flags, {
        adapter: "disconnected",
        servo: "unknown",
        category: (cat === "adapter_busy" ? "adapter_busy" : "no_adapter") as StatusCategory,
        hint: e.hint,
        error: e.message,
      });
      return ExitCode.Ok;
    }
    throw e;
  }

  try {
    // ---- Phase 2: identify ------------------------------------------------
    let id;
    try {
      id = await identify(handle);
    } catch (e) {
      // The adapter opened but the first HID write/read failed. Most
      // likely a stale IOKit/HID handle on our side.
      if (e instanceof AxonError) {
        emit(flags, {
          adapter: "connected",
          servo: "unknown",
          category: (e.category === "adapter_stale"
            ? "adapter_stale"
            : "adapter_stale") as StatusCategory,
          hint: e.hint,
          error: e.message,
        });
        return ExitCode.Ok;
      }
      throw e;
    }

    if (!id.present) {
      // Adapter is fine, HID transport is fine, but the dongle
      // reports no servo attached (rx[2]=0xFA is the canonical
      // "no servo" response). Tell the user exactly what to do.
      emit(flags, {
        adapter: "connected",
        servo: "absent",
        category: "no_servo",
        servo_status_byte: `0x${id.statusLo.toString(16).padStart(2, "0")}`,
        hint:
          "Adapter is connected but no servo is detected. Unplug the " +
          "servo from the dongle and plug it back in, leaving the " +
          "adapter connected. This re-primes the dongle's servo-presence " +
          "state.",
      });
      return ExitCode.Ok;
    }

    // ---- Phase 3: read the config block to get the model id ---------------
    let config: Buffer;
    try {
      config = await readFullConfig(handle);
    } catch (e) {
      // We had a PRESENT identify reply but the config read failed.
      // This would be a mid-transaction I/O error — surface it with
      // the servo still reported as present.
      if (e instanceof AxonError) {
        emit(flags, {
          adapter: "connected",
          servo: "present",
          category: "servo_present",
          hint: e.hint,
          error: e.message,
        });
        return ExitCode.Ok;
      }
      throw e;
    }

    const modelId = modelIdFromConfig(config);
    const catalog = loadCatalog();
    const model = findModel(catalog, modelId);

    emit(flags, {
      adapter: "connected",
      servo: "present",
      category: model ? "servo_present" : "unknown_model",
      hint: model
        ? undefined
        : `Model id "${modelId}" is not in the bundled catalog. Please ` +
          `open an issue at https://github.com/caryden/servo-programmer/issues ` +
          `with the output of \`axon read --svo > unknown.svo\` and we'll ` +
          `add it to the catalog.`,
      model: {
        id: modelId,
        name: model?.name ?? null,
        known: !!model,
        docs_url: model?.docs_url ?? null,
      },
    });
    return ExitCode.Ok;
  } finally {
    await handle.release();
  }
}

function emit(flags: GlobalFlags, result: StatusObservation): void {
  if (flags.json) {
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }
  if (flags.quiet) {
    // quiet mode: just the most-useful single line
    if (result.category === "servo_present" && result.model) {
      process.stdout.write(
        `${result.model.id}${result.model.name ? ` (${result.model.name})` : ""}\n`,
      );
    } else {
      process.stdout.write(`${result.category}\n`);
    }
    return;
  }
  // pretty human output
  process.stdout.write(`adapter  ${result.adapter}\n`);
  process.stdout.write(`servo    ${result.servo}`);
  if (result.servo_status_byte) {
    process.stdout.write(` (status ${result.servo_status_byte})`);
  }
  process.stdout.write("\n");
  process.stdout.write(`state    ${result.category}\n`);
  if (result.model) {
    process.stdout.write(`model    ${result.model.id}`);
    if (result.model.name) {
      process.stdout.write(` (${result.model.name})`);
    }
    if (!result.model.known) {
      process.stdout.write("  [unknown to catalog]");
    }
    process.stdout.write("\n");
    if (result.model.docs_url) {
      process.stdout.write(`docs     ${result.model.docs_url}\n`);
    }
  }
  if (result.error) {
    process.stderr.write(`error:   ${result.error}\n`);
  }
  if (result.hint) {
    process.stderr.write(`hint:    ${result.hint}\n`);
  }
}
