import {
  mountProbeApp,
  type ProbeConfigInfo,
  type ProbeFlashProgressEvent,
  type ProbeIdentifyInfo,
  type ProbeInventory,
} from "@axon/ui";
import { Electroview } from "electrobun/view";
import type {
  DesktopPocSchema,
  FlashJobResult,
  RpcResult,
  RuntimeInfo,
  SerializedAxonError,
} from "../shared/api.ts";

const transportLogListeners = new Set<(message: string) => void>();
const statusLogListeners = new Set<(message: string) => void>();
const inventoryWatchers = new Set<(inventory: ProbeInventory) => void>();
const flashProgressListeners = new Set<(event: ProbeFlashProgressEvent) => void>();
const debugEnabled = new URL(window.location.href).searchParams.has("debug");
let pendingFlashJob: {
  resolve: () => void;
  reject: (error: Error) => void;
} | null = null;

const rpc = Electroview.defineRPC<DesktopPocSchema>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {},
    messages: {
      transportLog: (message) => {
        for (const listener of transportLogListeners) {
          listener(message);
        }
      },
      inventory: (inventory) => {
        for (const watcher of inventoryWatchers) {
          watcher(inventory);
        }
      },
      flashProgress: (event) => {
        const line = formatFlashProgress(event, debugEnabled);
        for (const listener of statusLogListeners) {
          listener(line);
        }
        for (const listener of flashProgressListeners) {
          listener(event);
        }
      },
      flashResult: (result: FlashJobResult) => {
        if (!pendingFlashJob) return;
        const pending = pendingFlashJob;
        pendingFlashJob = null;
        if (result.ok) {
          pending.resolve();
          return;
        }
        pending.reject(new Error(describeError(result.error)));
      },
    },
  },
});

new Electroview({ rpc });

function describeError(error: SerializedAxonError): string {
  const out = [`${error.category ?? "internal"}: ${error.message}`];
  if (error.hint) {
    out.push(`hint: ${error.hint}`);
  }
  return out.join("\n");
}

async function unwrapResult<T>(promise: Promise<RpcResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) {
    throw new Error(describeError(result.error));
  }
  return result.data;
}

function formatFlashProgress(event: ProbeFlashProgressEvent, verbose: boolean): string {
  const parts = [`Flash ${event.phase}`];
  if (verbose && typeof event.recordsSent === "number" && typeof event.recordsTotal === "number") {
    parts.push(`${event.recordsSent}/${event.recordsTotal} records`);
  }
  if (verbose && typeof event.bytesSent === "number" && typeof event.bytesTotal === "number") {
    parts.push(`${event.bytesSent}/${event.bytesTotal} bytes`);
  }
  if (event.message) {
    parts.push(event.message);
  }
  return parts.join(" - ");
}

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Electrobun PoC DOM did not initialize correctly for #app");
}

mountProbeApp({
  root,
  autoConnectOnLoad: true,
  debugEnabled,
  initialAuthorizedAccess: true,
  livePollIntervalMs: 1000,
  subscribeTransportLog: (push) => {
    transportLogListeners.add(push);
    return () => {
      transportLogListeners.delete(push);
    };
  },
  subscribeStatusLog: (push) => {
    statusLogListeners.add(push);
    return () => {
      statusLogListeners.delete(push);
    };
  },
  watchInventory: (onInventory) => {
    inventoryWatchers.add(onInventory);
    return () => {
      inventoryWatchers.delete(onInventory);
    };
  },
  eyebrow: "Electrobun",
  title: "Axon Servo Programmer",
  description:
    "A clean desktop workspace for Axon V1.3 setup. Detect the adapter, identify the attached servo, and apply mode or configuration changes with native HID access in Bun.",
  bullets: [
    "Use this on the host OS with the adapter released from any VM such as Parallels.",
    "The shared UI stays clean while HID and firmware flashing stay in the Bun main process.",
    "File load/save/export use native desktop dialogs.",
  ],
  devicePanelTitle: "Visible Adapters",
  emptyDeviceText: "No adapter scan yet.",
  loadEnvironment: async (): Promise<RuntimeInfo> => unwrapResult(rpc.request.getRuntime()),
  loadInventory: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.refreshAdapters()),
  reconnectDevice: {
    label: "Reconnect",
    run: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.reconnectAdapter()),
  },
  refreshInventory: {
    label: "Find Adapter",
    run: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.refreshAdapters()),
  },
  openDevice: {
    label: "Connect",
    run: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.openAdapter()),
  },
  closeDevice: {
    label: "Disconnect",
    run: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.closeAdapter()),
  },
  identifyServo: {
    label: "Find Servo",
    run: async (): Promise<ProbeIdentifyInfo> => unwrapResult(rpc.request.identifyServo()),
  },
  readFullConfig: {
    label: "Show Current Setup",
    run: async (): Promise<ProbeConfigInfo> => unwrapResult(rpc.request.readFullConfig()),
  },
  writeFullConfig: {
    label: "Apply",
    run: async (bytes: Uint8Array): Promise<void> =>
      unwrapResult(rpc.request.writeFullConfig({ bytes: Array.from(bytes) })),
  },
  flashModeChange: {
    label: "Flash Mode",
    run: async ({ targetMode, modelId, onProgress }): Promise<void> => {
      if (pendingFlashJob) {
        throw new Error("A flash is already in progress.");
      }
      const listener = onProgress
        ? (event: ProbeFlashProgressEvent) => {
            onProgress(event);
          }
        : null;
      if (listener) {
        flashProgressListeners.add(listener);
      }
      try {
        const completion = new Promise<void>((resolve, reject) => {
          pendingFlashJob = { resolve, reject };
        });
        try {
          await unwrapResult(rpc.request.startFlashModeChange({ targetMode, modelId }));
        } catch (error) {
          pendingFlashJob = null;
          throw error;
        }
        await completion;
      } finally {
        pendingFlashJob = null;
        if (listener) {
          flashProgressListeners.delete(listener);
        }
      }
    },
  },
  flashFirmwareFile: {
    label: "Flash Firmware File",
    run: async ({ bytes, expectedModelId, onProgress }): Promise<void> => {
      if (pendingFlashJob) {
        throw new Error("A flash is already in progress.");
      }
      const listener = onProgress
        ? (event: ProbeFlashProgressEvent) => {
            onProgress(event);
          }
        : null;
      if (listener) {
        flashProgressListeners.add(listener);
      }
      try {
        const completion = new Promise<void>((resolve, reject) => {
          pendingFlashJob = { resolve, reject };
        });
        try {
          await unwrapResult(
            rpc.request.startFlashFirmwareFile({ bytes: Array.from(bytes), expectedModelId }),
          );
        } catch (error) {
          pendingFlashJob = null;
          throw error;
        }
        await completion;
      } finally {
        pendingFlashJob = null;
        if (listener) {
          flashProgressListeners.delete(listener);
        }
      }
    },
  },
  loadConfigFile: {
    label: "Load config",
    run: async () => unwrapResult(rpc.request.loadConfigFile()),
  },
  loadFirmwareFile: {
    label: "Load firmware file",
    run: async () => unwrapResult(rpc.request.loadFirmwareFile()),
  },
  saveAxonFile: {
    label: "Save .axon config",
    run: async ({ suggestedName, text }) =>
      unwrapResult(rpc.request.saveAxonFile({ suggestedName, text })),
  },
  exportSvoFile: {
    label: "Export .svo vendor file",
    run: async ({ suggestedName, bytes }) =>
      unwrapResult(rpc.request.exportSvoFile({ suggestedName, bytes })),
  },
});
