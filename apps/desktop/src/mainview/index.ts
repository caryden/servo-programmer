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
  eyebrow: "Electrobun Lab",
  title: "Axon Servo Programmer",
  description:
    "A clean desktop workspace for Axon V1.3 setup. Detect the adapter, identify the attached servo, and load the current profile before making mode or configuration changes.",
  bullets: [
    "Use this on the host OS with the adapter released from any VM such as Parallels.",
    "The shared UI stays clean while HID traffic lives in the Bun main process.",
    "Diagnostics stay tucked away until you open them.",
  ],
  devicePanelTitle: "Visible Adapters",
  emptyDeviceText: "No adapter scan yet.",
  loadEnvironment: async (): Promise<RuntimeInfo> => unwrapResult(rpc.request.getRuntime()),
  loadInventory: async (): Promise<ProbeInventory> => unwrapResult(rpc.request.refreshAdapters()),
  refreshInventory: {
    label: "Scan Adapters",
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
    label: "Detect Servo",
    run: async (): Promise<ProbeIdentifyInfo> => unwrapResult(rpc.request.identifyServo()),
  },
  readFullConfig: {
    label: "Load Settings",
    run: async (): Promise<ProbeConfigInfo> => unwrapResult(rpc.request.readFullConfig()),
  },
});
