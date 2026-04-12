import { BrowserView, BrowserWindow } from "electrobun/bun";
import { findModel, loadCatalog } from "../../../../packages/core/src/catalog.ts";
import { AxonError } from "../../../../packages/core/src/errors.ts";
import {
  listDongles,
  openDongle,
  type DongleDescriptor,
} from "../../../../axon/src/driver/hid.ts";
import {
  identify,
  modelIdFromConfig,
  readFullConfig,
  type IdentifyReply,
} from "../../../../packages/core/src/driver/protocol.ts";
import type {
  AdapterInfo,
  AdapterInventory,
  ConfigInfo,
  DesktopPocSchema,
  IdentifyInfo,
  RpcResult,
  RuntimeInfo,
  SerializedAxonError,
} from "../shared/api.ts";

const WINDOW_WIDTH = 960;
const WINDOW_HEIGHT = 860;

let activeDescriptor: DongleDescriptor | null = null;
let activeHandle:
  | Awaited<ReturnType<typeof openDongle>>
  | null = null;

function hex(value: number | undefined, width = 2): string | null {
  if (value === undefined) return null;
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function hexDump(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function serializeDescriptor(descriptor: DongleDescriptor): AdapterInfo {
  return {
    path: descriptor.path ?? null,
    vendorId: hex(descriptor.vendorId, 4),
    productId: hex(descriptor.productId, 4),
    product: descriptor.product ?? null,
    manufacturer: descriptor.manufacturer ?? null,
    serialNumber: descriptor.serialNumber ?? null,
    interface: descriptor.interface ?? null,
    usagePage: hex(descriptor.usagePage, 4),
    usage: hex(descriptor.usage, 4),
  };
}

function currentInventory(): AdapterInventory {
  return {
    adapters: listDongles().map(serializeDescriptor),
    openedPath: activeDescriptor?.path ?? null,
  };
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

async function withResult<T>(fn: () => Promise<T> | T): Promise<RpcResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

async function releaseActiveHandle(): Promise<void> {
  if (!activeHandle) return;
  await activeHandle.release();
  activeHandle = null;
  activeDescriptor = null;
}

function requireOpenHandle() {
  if (!activeHandle) {
    throw AxonError.validation("Open the Axon adapter first.");
  }
  return activeHandle;
}

function toIdentifyInfo(reply: IdentifyReply): IdentifyInfo {
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

const rpc = BrowserView.defineRPC<DesktopPocSchema>({
  handlers: {
    requests: {
      getRuntime: () => withResult(() => runtimeInfo()),
      refreshAdapters: () => withResult(() => currentInventory()),
      openAdapter: (params) =>
        withResult(async () => {
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
          return currentInventory();
        }),
      closeAdapter: () =>
        withResult(async () => {
          await releaseActiveHandle();
          return currentInventory();
        }),
      identifyServo: () =>
        withResult(async () => {
          const handle = requireOpenHandle();
          return toIdentifyInfo(await identify(handle));
        }),
      readFullConfig: () =>
        withResult(async () => {
          const handle = requireOpenHandle();
          const config = await readFullConfig(handle);
          const modelId = modelIdFromConfig(config);
          const catalog = loadCatalog();
          const model = findModel(catalog, modelId);
          const chunkSplit = 59;

          const info: ConfigInfo = {
            length: config.length,
            modelId,
            known: Boolean(model),
            modelName: model?.name ?? null,
            docsUrl: model?.docs_url ?? null,
            rawHex: hexDump(config),
            firstChunk: hexDump(config.subarray(0, chunkSplit)),
            secondChunk: hexDump(config.subarray(chunkSplit)),
          };
          return info;
        }),
    },
    messages: {},
  },
});

const mainWindow = new BrowserWindow({
  title: "Axon Electrobun PoC",
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

process.on("beforeExit", async () => {
  await releaseActiveHandle();
});

console.log(`Axon Electrobun PoC started (window ${mainWindow.id})`);
