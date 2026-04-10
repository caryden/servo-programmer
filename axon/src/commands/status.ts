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
 *   adapter_busy    — USB device found but `HID.HID(path)` threw
 *                     (positive observation that the open failed)
 *   adapter_io      — open succeeded but the first HID write/read
 *                     was rejected (pure observation, no speculation)
 *   no_servo        — identify worked but rx[2]=0xFA (no servo on
 *                     the wire, user needs to replug the servo)
 *   servo_present   — everything is fine; model id is reported
 *   unknown_model   — servo reports a model id not in the catalog
 *
 * In --json mode, every response includes a machine-readable
 * `category` field that an agent or script can branch on instead
 * of parsing text.
 */

import { findModel, loadCatalog } from "../catalog.ts";
import type { GlobalFlags } from "../cli.ts";
import { isDonglePresent, openDongle } from "../driver/hid.ts";
import {
  type IdentifyReply,
  identify,
  modelIdFromConfig,
  readFullConfig,
} from "../driver/protocol.ts";
import type { DongleHandle } from "../driver/transport.ts";
import { AxonError, ExitCode } from "../errors.ts";
import { renderStatusBar } from "../util/tui.ts";

type StatusCategory =
  | "no_adapter"
  | "adapter_busy"
  | "adapter_io"
  | "no_servo"
  | "servo_io"
  | "unknown_model"
  | "servo_present";

interface StatusObservation {
  adapter: "connected" | "disconnected";
  servo: "present" | "absent" | "unknown";
  category: StatusCategory;
  hint?: string;
  servo_status_byte?: string;
  mode_label?: string;
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
      hint: "Plug in the Axon servo programmer adapter.",
    });
    return ExitCode.Ok;
  }

  // ---- Phase 1: open and claim the HID handle -------------------------------
  let handle: DongleHandle;
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
    let id: IdentifyReply;
    try {
      id = await identify(handle);
    } catch (e) {
      // The adapter opened but the first HID write/read failed.
      // Report the raw observation verbatim — no speculation.
      if (e instanceof AxonError) {
        emit(flags, {
          adapter: "connected",
          servo: "unknown",
          category: "adapter_io",
          hint: e.hint,
          error: e.message,
        });
        return ExitCode.Ok;
      }
      throw e;
    }

    if (!id.present) {
      // Adapter is fine, HID transport is fine, but the adapter
      // reports no servo attached (rx[2]=0xFA is the canonical
      // "no servo" response). Tell the user exactly what to do.
      emit(flags, {
        adapter: "connected",
        servo: "absent",
        category: "no_servo",
        servo_status_byte: `0x${id.statusLo.toString(16).padStart(2, "0")}`,
        hint:
          "Adapter is connected but no servo is detected. " +
          "Unplug the servo from the adapter and plug it back in " +
          "(leave the adapter connected).",
      });
      return ExitCode.Ok;
    }

    // ---- Phase 3: read the config block to get the model id ---------------
    let config: Buffer;
    try {
      config = await readFullConfig(handle);
    } catch (e) {
      // We had a PRESENT identify reply but the config read failed.
      // This is a mid-transaction I/O failure — surface it with a
      // category that matches reality (servo_io), NOT servo_present.
      // Scripts branching on `category === "servo_present"` must not
      // see success here.
      if (e instanceof AxonError) {
        emit(flags, {
          adapter: "connected",
          servo: "present",
          category: "servo_io",
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

    const modeLabel =
      id.mode === "servo_mode" ? "Servo Mode" : id.mode === "cr_mode" ? "CR Mode" : null;

    emit(flags, {
      adapter: "connected",
      servo: "present",
      category: model ? "servo_present" : "unknown_model",
      mode_label: modeLabel ?? undefined,
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
    if (result.category === "servo_present" && result.model) {
      process.stdout.write(
        `${result.model.id}${result.model.name ? ` (${result.model.name})` : ""}\n`,
      );
    } else {
      process.stdout.write(`${result.category}\n`);
    }
    return;
  }
  // Pretty TUI output: colored status bar
  process.stdout.write(
    renderStatusBar({
      connected: result.adapter === "connected",
      modelName: result.model?.name ?? null,
      modeName: result.mode_label ?? null,
    }) + "\n",
  );
  if (result.model?.docs_url) {
    process.stdout.write(`docs: ${result.model.docs_url}\n`);
  }
  if (result.error) {
    process.stderr.write(`error: ${result.error}\n`);
  }
  if (result.hint) {
    process.stderr.write(`hint: ${result.hint}\n`);
  }
}
