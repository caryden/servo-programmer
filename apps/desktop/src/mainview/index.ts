import {
  mountProbeApp,
  type ProbeConfigInfo,
  type ProbeIdentifyInfo,
  type ProbeInventory,
} from "@axon/ui";
import { Electroview } from "electrobun/view";
import type {
  DesktopPocSchema,
  RpcResult,
  RuntimeInfo,
  SerializedAxonError,
} from "../shared/api.ts";

const rpc = Electroview.defineRPC<DesktopPocSchema>({
  handlers: {
    requests: {},
    messages: {},
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

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Electrobun PoC DOM did not initialize correctly for #app");
}

mountProbeApp({
  root,
  title: "Axon Electrobun PoC",
  description:
    "Minimal desktop probe for the Axon V1.3 HID adapter. The UI is shared with the WebHID PoC, while HID traffic stays in the Bun main process through the node-hid transport.",
  bullets: [
    "Use this on the host OS with the adapter released from any VM such as Parallels.",
    "This PoC mirrors the WebHID flow, but it does not depend on browser WebHID support.",
    "It only enumerates, identifies, and reads config. It does not write or flash firmware.",
  ],
  devicePanelTitle: "Visible Adapters",
  emptyDeviceText: "No adapter scan yet.",
  loadEnvironment: async (): Promise<RuntimeInfo> => unwrapResult(rpc.request.getRuntime()),
  loadInventory: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.refreshAdapters()),
  refreshInventory: {
    label: "Refresh Visible Adapters",
    run: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.refreshAdapters()),
  },
  openDevice: {
    label: "Open First Visible Adapter",
    run: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.openAdapter()),
  },
  closeDevice: {
    label: "Close Adapter",
    run: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.closeAdapter()),
  },
  identifyServo: {
    label: "Identify",
    run: async (): Promise<ProbeIdentifyInfo> => unwrapResult(rpc.request.identifyServo()),
  },
  readFullConfig: {
    label: "Read Full Config",
    run: async (): Promise<ProbeConfigInfo> => unwrapResult(rpc.request.readFullConfig()),
  },
});
