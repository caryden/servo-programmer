/**
 * `axon status` — one-shot presence check.
 *
 * Returns:
 *   adapter  connected | disconnected
 *   servo    present | absent
 *   model    (if servo present and we can read the config)
 */

import {
  identify,
  readFullConfig,
  modelIdFromConfig,
} from "../driver/protocol.ts";
import { isDonglePresent, openDongle } from "../driver/hid.ts";
import { findModel, loadCatalog } from "../catalog.ts";
import { AxonError, ExitCode } from "../errors.ts";
import type { GlobalFlags } from "../cli.ts";

export async function runStatus(flags: GlobalFlags): Promise<number> {
  // Phase 0: USB-level presence. Cheap, no claim needed.
  if (!isDonglePresent()) {
    emit(flags, {
      adapter: "disconnected",
      servo: "absent",
    });
    // exit code 2 would be fatal; `status` is informational, so we
    // return 0 and let the user read the output. The exit code is
    // reserved for commands that *need* the dongle.
    return ExitCode.Ok;
  }

  // Phase 1: open and identify.
  const handle = await openDongle();
  try {
    const id = await identify(handle);
    if (!id.present) {
      emit(flags, {
        adapter: "connected",
        servo: "absent",
        servo_status_byte: `0x${id.statusLo.toString(16).padStart(2, "0")}`,
        hint: "replug the servo (adapter stays)",
      });
      return ExitCode.Ok;
    }

    // Phase 2: read the config block to get the model id.
    const config = await readFullConfig(handle);
    const modelId = modelIdFromConfig(config);
    const catalog = loadCatalog();
    const model = findModel(catalog, modelId);

    emit(flags, {
      adapter: "connected",
      servo: "present",
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

function emit(
  flags: GlobalFlags,
  result: {
    adapter: "connected" | "disconnected";
    servo: "present" | "absent";
    servo_status_byte?: string;
    hint?: string;
    model?: {
      id: string;
      name: string | null;
      known: boolean;
      docs_url: string | null;
    };
  },
): void {
  if (flags.json) {
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }
  if (flags.quiet) {
    // quiet mode: just the most-useful single line
    if (result.servo === "present" && result.model) {
      process.stdout.write(
        `${result.model.id}${result.model.name ? ` (${result.model.name})` : ""}\n`,
      );
    } else {
      process.stdout.write(`${result.adapter} / ${result.servo}\n`);
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
  if (result.hint) {
    process.stderr.write(`hint:    ${result.hint}\n`);
  }
}
