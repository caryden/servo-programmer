import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { findModel, loadCatalog } from "@axon/core/catalog";
import { servoModeLabel, summarizeConfig } from "@axon/core/config-summary";
import { flashFirmware } from "@axon/core/driver/flash";
import {
  type IdentifyReply,
  identify,
  modelIdFromConfig,
  readFullConfig,
  writeFullConfig,
} from "@axon/core/driver/protocol";
import { AxonError } from "@axon/core/errors";
import { decryptSfw } from "@axon/core/sfw";
import { type DongleDescriptor, listDongles, openDongle } from "@axon/transport-nodehid";
import type {
  ProbeConfigInfo,
  ProbeDeviceInfo,
  ProbeFirmwareFile,
  ProbeFlashProgressEvent,
  ProbeIdentifyInfo,
  ProbeInventory,
  ProbeLoadedFile,
  ProbeSavedFile,
} from "@axon/ui";
import { ApplicationMenu, BrowserView, BrowserWindow, Utils } from "electrobun/bun";
import type {
  DesktopPocSchema,
  FlashJobResult,
  RpcResult,
  RuntimeInfo,
  SerializedAxonError,
} from "../shared/api.ts";

const WINDOW_WIDTH = 980;
const WINDOW_HEIGHT = 980;
const APP_NAME = "Axon Servo Programmer";
const APP_DOCS_URL = "https://docs.axon-robotics.com/archive/programmer";
const PROGRAMMER_MK2_URL = "https://docs.axon-robotics.com/servos/programmer";
const INVENTORY_POLL_MS = 1000;
const POST_FLASH_PAUSE_MS = 400;

let activeDescriptor: DongleDescriptor | null = null;
let activeHandle: Awaited<ReturnType<typeof openDongle>> | null = null;
let hardwareSessionDepth = 0;
let lastInventorySnapshot = "";
let lastDialogFolder = join(homedir(), "Downloads");
let lastIdentifyMode: ProbeIdentifyInfo["mode"] = "unknown";
let activeFlashJob: Promise<void> | null = null;

function hex(value: number | undefined, width = 2): string | null {
  if (value === undefined) return null;
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function hexDump(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function serializeDescriptor(descriptor: DongleDescriptor): ProbeDeviceInfo {
  return {
    id: descriptor.path ?? null,
    vendorId: hex(descriptor.vendorId, 4),
    productId: hex(descriptor.productId, 4),
    product: descriptor.product ?? null,
    manufacturer: descriptor.manufacturer ?? null,
    serialNumber: descriptor.serialNumber ?? null,
    interface: descriptor.interface ?? null,
    usagePage: hex(descriptor.usagePage, 4),
    usage: hex(descriptor.usage, 4),
    opened: descriptor.path === activeDescriptor?.path,
  };
}

function inventoryFromDescriptors(descriptors: DongleDescriptor[]): ProbeInventory {
  return {
    devices: descriptors.map(serializeDescriptor),
    openedId: activeDescriptor?.path ?? null,
  };
}

function repoRoot(): string {
  return resolve(import.meta.dir, "../../..");
}

function downloadsCandidatePaths(filename: string): string[] {
  return [
    join(import.meta.dir, "../downloads", filename),
    join(repoRoot(), "downloads", filename),
    join(process.cwd(), "downloads", filename),
    join(process.cwd(), "..", "downloads", filename),
    join(import.meta.dir, "../../../downloads", filename),
    join(import.meta.dir, "../../downloads", filename),
  ];
}

function firstExistingPath(paths: string[]): string | null {
  for (const candidate of paths) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function catalogFirmwareKey(mode: "servo_mode" | "cr_mode"): "standard" | "continuous" {
  return mode === "servo_mode" ? "standard" : "continuous";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function serializeError(error: unknown): SerializedAxonError {
  if (error instanceof AxonError) {
    return {
      message: error.message,
      code: error.code,
      category: error.category,
      hint: error.hint,
    };
  }

  if (error instanceof Error) {
    return { message: error.message, category: "internal" };
  }

  return { message: String(error), category: "internal" };
}

function isTransientProbeError(error: unknown): boolean {
  if (error instanceof AxonError) {
    if (error.category === "servo_io") return true;
    if (error.category === "no_servo") return true;
  }
  if (error instanceof Error) {
    return /read nack|timed out|no servo/i.test(error.message);
  }
  return false;
}

function shouldResetHandleOnProbeFailure(error: unknown): boolean {
  if (error instanceof AxonError) {
    return error.category === "servo_io" || error.category === "adapter_io";
  }
  if (error instanceof Error) {
    return /read nack|timed out|rpc request timed out|servo i\/o/i.test(error.message);
  }
  return false;
}

async function withResult<T>(fn: () => Promise<T> | T): Promise<RpcResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

async function withTransientProbeRetry<T>(
  label: string,
  run: () => Promise<T>,
  attempts = 4,
  delayMs = 250,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !isTransientProbeError(error)) {
        throw error;
      }
      emitTransportLog(`${label} retry`, {
        attempt: attempt + 1,
        error: serializeError(error),
      });
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

async function resetHandleAfterProbeFailure(label: string, error: unknown): Promise<void> {
  if (!shouldResetHandleOnProbeFailure(error)) return;
  emitTransportLog(`${label} reset handle`, { error: serializeError(error) });
  try {
    await releaseActiveHandle();
  } finally {
    await refreshInventoryState(true);
    // Force the next inventory poll to emit the same visible-adapter state again.
    // The renderer ignores the forced emission while a connect/read cycle is still busy.
    // Emitting it once more on the next idle tick lets auto-connect retry cleanly.
    lastInventorySnapshot = "";
  }
}

async function releaseActiveHandle(): Promise<void> {
  if (!activeHandle) return;
  await activeHandle.release();
  activeHandle = null;
  activeDescriptor = null;
}

async function resetConnectionState(label: string): Promise<ProbeInventory> {
  emitTransportLog(`${label} reset connection`);
  lastIdentifyMode = "unknown";
  await releaseActiveHandle();
  const inventory = await refreshInventoryState(true);
  // Force one more visible inventory emission on the next idle cycle so the
  // renderer-side reconnect logic does not get stuck on an unchanged snapshot.
  lastInventorySnapshot = "";
  return inventory;
}

function emitTransportLog(message: string, extra?: unknown): void {
  try {
    const payload =
      extra === undefined
        ? `[transport] ${message}`
        : `[transport] ${message} ${JSON.stringify(extra)}`;
    rpc.send.transportLog(payload);
  } catch {}
}

function emitInventory(inventory: ProbeInventory, force = false): void {
  const snapshot = JSON.stringify(inventory);
  if (!force && snapshot === lastInventorySnapshot) return;
  lastInventorySnapshot = snapshot;
  try {
    rpc.send.inventory(inventory);
  } catch {}
}

function emitFlashProgress(event: ProbeFlashProgressEvent): void {
  try {
    rpc.send.flashProgress(event);
  } catch {}
}

function emitFlashResult(result: FlashJobResult): void {
  try {
    rpc.send.flashResult(result);
  } catch {}
}

async function withHardwareSession<T>(label: string, run: () => Promise<T>): Promise<T> {
  hardwareSessionDepth += 1;
  emitTransportLog(`hardware session start: ${label}`);
  try {
    return await run();
  } finally {
    hardwareSessionDepth = Math.max(0, hardwareSessionDepth - 1);
    emitTransportLog(`hardware session end: ${label}`);
  }
}

function requireOpenHandle() {
  if (!activeHandle) {
    throw AxonError.validation("Open the Axon adapter first.");
  }
  return activeHandle;
}

function toIdentifyInfo(reply: IdentifyReply): ProbeIdentifyInfo {
  return {
    present: reply.present,
    statusHi: hex(reply.statusHi) ?? "0x00",
    statusLo: hex(reply.statusLo) ?? "0x00",
    modeByte: hex(reply.modeByte ?? undefined),
    mode: reply.mode,
    rawRx: hexDump(reply.rawRx),
  };
}

function runtimeInfo(): RuntimeInfo {
  return {
    transport: "Electrobun RPC -> Bun main process -> node-hid",
    platform: process.platform,
    arch: process.arch,
    bunVersion: Bun.version,
    renderer: "native system webview",
  };
}

async function refreshInventoryState(force = false): Promise<ProbeInventory> {
  const descriptors = listDongles();
  if (
    activeDescriptor?.path &&
    !descriptors.some((descriptor) => descriptor.path === activeDescriptor?.path)
  ) {
    await releaseActiveHandle();
  }
  const inventory = inventoryFromDescriptors(descriptors);
  emitTransportLog("refreshInventoryState()", {
    devices: inventory.devices.length,
    openedId: inventory.openedId,
  });
  emitInventory(inventory, force);
  return inventory;
}

function normalizeSelectedPath(result: string[] | undefined): string | null {
  const first = result?.[0]?.trim();
  if (!first) return null;
  const nextFolder = existsSync(first) && statSync(first).isDirectory() ? first : dirname(first);
  lastDialogFolder = nextFolder;
  return first;
}

function sanitizeSuggestedName(name: string, extension: ".axon" | ".svo"): string {
  const base = basename(name).replace(/[\\/]/g, "").trim() || `config${extension}`;
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
}

async function promptDirectoryForSave(
  suggestedName: string,
  extension: ".axon" | ".svo",
): Promise<string | null> {
  const directory = normalizeSelectedPath(
    await Utils.openFileDialog({
      startingFolder: lastDialogFolder,
      allowedFileTypes: "*",
      canChooseFiles: false,
      canChooseDirectory: true,
      allowsMultipleSelection: false,
    }),
  );
  if (!directory) {
    return null;
  }
  const targetPath = join(directory, sanitizeSuggestedName(suggestedName, extension));
  if (existsSync(targetPath)) {
    const { response } = await Utils.showMessageBox({
      type: "question",
      title: APP_NAME,
      message: `Replace ${basename(targetPath)}?`,
      detail: "A file with that name already exists in the selected folder.",
      buttons: ["Replace", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) {
      return null;
    }
  }
  return targetPath;
}

function loadBundledFirmware(
  modelId: string,
  mode: "servo_mode" | "cr_mode",
): { bytes: Buffer; file: string } {
  const model = findModel(loadCatalog(), modelId);
  if (!model) {
    throw new Error(`Unknown model ${modelId}.`);
  }
  const entry = model.bundled_firmware[catalogFirmwareKey(mode)];
  if (!entry) {
    throw new Error(`No bundled firmware is cataloged for ${model.name} ${servoModeLabel(mode)}.`);
  }
  const firmwarePath = firstExistingPath(downloadsCandidatePaths(entry.file));
  if (!firmwarePath) {
    throw new Error(`Could not locate bundled firmware ${entry.file}.`);
  }
  const bytes = readFileSync(firmwarePath);
  const actual = sha256Hex(bytes);
  if (actual.toLowerCase() !== entry.sha256.toLowerCase()) {
    throw new Error(`Firmware SHA-256 mismatch for ${entry.file}.`);
  }
  return { bytes, file: entry.file };
}

const rpc = BrowserView.defineRPC<DesktopPocSchema>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      getRuntime: () => withResult(() => runtimeInfo()),
      refreshAdapters: () => withResult(() => refreshInventoryState(true)),
      reconnectAdapter: () =>
        withResult(async () => {
          return await withHardwareSession("reconnectAdapter", async () => {
            return await resetConnectionState("reconnectAdapter");
          });
        }),
      openAdapter: (params) =>
        withResult(async () => {
          return await withHardwareSession("openAdapter", async () => {
            await releaseActiveHandle();
            const descriptors = listDongles();
            const selected =
              params?.path === undefined
                ? descriptors[0]
                : descriptors.find((descriptor) => descriptor.path === params.path);

            if (!selected) {
              if (params?.path) {
                throw AxonError.validation(`Adapter path not found: ${params.path}`);
              }
              throw AxonError.noAdapter("Axon dongle not found on USB.");
            }

            activeHandle = await openDongle(selected);
            activeDescriptor = selected;
            return await refreshInventoryState(true);
          });
        }),
      closeAdapter: () =>
        withResult(async () => {
          return await withHardwareSession("closeAdapter", async () => {
            await releaseActiveHandle();
            return await refreshInventoryState(true);
          });
        }),
      identifyServo: () =>
        withResult(async () => {
          return await withHardwareSession("identifyServo", async () => {
            const handle = requireOpenHandle();
            try {
              const info = toIdentifyInfo(await identify(handle));
              lastIdentifyMode = info.mode;
              return info;
            } catch (error) {
              await resetHandleAfterProbeFailure("identifyServo", error);
              throw error;
            }
          });
        }),
      readFullConfig: () =>
        withResult(async () => {
          return await withHardwareSession("readFullConfig", async () => {
            const handle = requireOpenHandle();
            try {
              const config = await withTransientProbeRetry("readFullConfig", async () =>
                readFullConfig(handle),
              );
              const modelId = modelIdFromConfig(config);
              const catalog = loadCatalog();
              const model = findModel(catalog, modelId);
              const chunkSplit = 59;

              const info: ProbeConfigInfo = {
                length: config.length,
                modelId,
                known: Boolean(model),
                modelName: model?.name ?? null,
                docsUrl: model?.docs_url ?? null,
                mode: lastIdentifyMode,
                modeLabel: servoModeLabel(lastIdentifyMode),
                setup: summarizeConfig(config, modelId),
                rawHex: hexDump(config),
                firstChunk: hexDump(config.subarray(0, chunkSplit)),
                secondChunk: hexDump(config.subarray(chunkSplit)),
                rawBytes: Array.from(config),
              };
              return info;
            } catch (error) {
              await resetHandleAfterProbeFailure("readFullConfig", error);
              throw error;
            }
          });
        }),
      writeFullConfig: (params) =>
        withResult(async () => {
          await withHardwareSession("writeFullConfig", async () => {
            const handle = requireOpenHandle();
            await writeFullConfig(handle, Uint8Array.from(params.bytes));
          });
        }),
      startFlashModeChange: (params) =>
        withResult(async () => {
          if (activeFlashJob) {
            throw AxonError.validation("A mode change is already in progress.");
          }
          activeFlashJob = (async () => {
            try {
              await withHardwareSession("flashModeChange", async () => {
                const handle = requireOpenHandle();
                const { bytes } = loadBundledFirmware(params.modelId, params.targetMode);
                const decrypted = decryptSfw(bytes);
                await flashFirmware(handle, decrypted, {
                  expectedModelId: params.modelId,
                  onProgress: (event) => {
                    emitFlashProgress(event);
                  },
                  onWireDebug: (message) => emitTransportLog(`[wire] ${message}`),
                });
                await sleep(POST_FLASH_PAUSE_MS);
                await resetConnectionState("flashModeChange");
              });
              emitFlashResult({ ok: true });
            } catch (error) {
              emitFlashResult({ ok: false, error: serializeError(error) });
            } finally {
              activeFlashJob = null;
            }
          })();
        }),
      startFlashFirmwareFile: (params) =>
        withResult(async () => {
          if (activeFlashJob) {
            throw AxonError.validation("A mode change is already in progress.");
          }
          activeFlashJob = (async () => {
            try {
              await withHardwareSession("flashFirmwareFile", async () => {
                const handle = requireOpenHandle();
                const decrypted = decryptSfw(Buffer.from(params.bytes));
                await flashFirmware(handle, decrypted, {
                  expectedModelId: params.expectedModelId ?? decrypted.header.modelId,
                  onProgress: (event) => {
                    emitFlashProgress(event);
                  },
                  onWireDebug: (message) => emitTransportLog(`[wire] ${message}`),
                });
                await sleep(POST_FLASH_PAUSE_MS);
                await resetConnectionState("flashFirmwareFile");
              });
              emitFlashResult({ ok: true });
            } catch (error) {
              emitFlashResult({ ok: false, error: serializeError(error) });
            } finally {
              activeFlashJob = null;
            }
          })();
        }),
      loadConfigFile: () =>
        withResult(async () => {
          const selectedPath = normalizeSelectedPath(
            await Utils.openFileDialog({
              startingFolder: lastDialogFolder,
              allowedFileTypes: "axon,svo",
              canChooseFiles: true,
              canChooseDirectory: false,
              allowsMultipleSelection: false,
            }),
          );
          if (!selectedPath) {
            return null;
          }
          const lower = selectedPath.toLowerCase();
          if (lower.endsWith(".svo")) {
            const bytes = readFileSync(selectedPath);
            const result: ProbeLoadedFile = {
              name: basename(selectedPath),
              format: "svo",
              bytes: Array.from(bytes),
            };
            return result;
          }
          const text = readFileSync(selectedPath, "utf8");
          const result: ProbeLoadedFile = {
            name: basename(selectedPath),
            format: "axon",
            text,
          };
          return result;
        }),
      loadFirmwareFile: () =>
        withResult(async () => {
          const selectedPath = normalizeSelectedPath(
            await Utils.openFileDialog({
              startingFolder: lastDialogFolder,
              allowedFileTypes: "sfw",
              canChooseFiles: true,
              canChooseDirectory: false,
              allowsMultipleSelection: false,
            }),
          );
          if (!selectedPath) {
            return null;
          }
          const result: ProbeFirmwareFile = {
            name: basename(selectedPath),
            bytes: Array.from(readFileSync(selectedPath)),
          };
          return result;
        }),
      saveAxonFile: (params) =>
        withResult(async () => {
          const targetPath = await promptDirectoryForSave(params.suggestedName, ".axon");
          if (!targetPath) {
            return { path: null } satisfies ProbeSavedFile;
          }
          writeFileSync(targetPath, params.text, "utf8");
          return { path: targetPath } satisfies ProbeSavedFile;
        }),
      exportSvoFile: (params) =>
        withResult(async () => {
          const targetPath = await promptDirectoryForSave(params.suggestedName, ".svo");
          if (!targetPath) {
            return { path: null } satisfies ProbeSavedFile;
          }
          writeFileSync(targetPath, Buffer.from(params.bytes));
          return { path: targetPath } satisfies ProbeSavedFile;
        }),
    },
    messages: {},
  },
});

const mainWindow = new BrowserWindow({
  title: APP_NAME,
  url: "views://mainview/index.html",
  rpc,
  frame: {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: 160,
    y: 120,
  },
  renderer: "native",
});

ApplicationMenu.setApplicationMenu([
  {
    label: APP_NAME,
    submenu: [
      { role: "about" },
      { type: "divider" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "showAll" },
      { type: "divider" },
      {
        label: `Quit ${APP_NAME}`,
        action: "app-quit",
        accelerator: "CommandOrControl+Q",
      },
    ],
  },
  {
    label: "File",
    submenu: [{ role: "close" }],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "divider" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      {
        label: "Reload",
        action: "view-reload",
        accelerator: "CommandOrControl+R",
      },
      {
        label: "Toggle Developer Tools",
        action: "view-toggle-devtools",
        accelerator: "Alt+CommandOrControl+I",
      },
    ],
  },
  {
    label: "Window",
    submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "bringAllToFront" }],
  },
  {
    label: "Help",
    submenu: [
      { label: "Legacy Programmer Guide", action: "help-legacy-programmer" },
      { label: "Programmer MK2 Guide", action: "help-programmer-mk2" },
    ],
  },
]);

ApplicationMenu.on("application-menu-clicked", (event) => {
  const action = (event as { data?: { action?: string } })?.data?.action;

  switch (action) {
    case "app-quit":
      void releaseActiveHandle().finally(() => {
        Utils.quit();
      });
      break;
    case "view-reload":
      mainWindow.webview.executeJavascript("window.location.reload()");
      break;
    case "view-toggle-devtools":
      mainWindow.webview.toggleDevTools();
      break;
    case "help-legacy-programmer":
      Utils.openExternal(APP_DOCS_URL);
      break;
    case "help-programmer-mk2":
      Utils.openExternal(PROGRAMMER_MK2_URL);
      break;
    default:
      break;
  }
});

process.on("beforeExit", async () => {
  await releaseActiveHandle();
});

console.log(`${APP_NAME} started (window ${mainWindow.id})`);

const inventoryTimer = setInterval(() => {
  if (hardwareSessionDepth > 0) return;
  void refreshInventoryState();
}, INVENTORY_POLL_MS);

process.on("beforeExit", () => {
  clearInterval(inventoryTimer);
});
