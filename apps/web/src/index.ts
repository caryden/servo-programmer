import { findModel, loadCatalog } from "@axon/core/catalog";
import { identify, modelIdFromConfig, readFullConfig } from "@axon/core/driver/protocol";
import {
  deviceId,
  listAuthorizedAxonDevices,
  openDongle,
  requestAxonDevices,
  summarizeDevice,
  webHidSupported,
} from "@axon/transport-webhid";
import {
  mountProbeApp,
  type ProbeConfigInfo,
  type ProbeIdentifyInfo,
  type ProbeInventory,
} from "@axon/ui";

function hex(value: number, width = 2): string {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function hexDump(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Web probe root #app was not found.");
}

let selectedDevice: HIDDevice | null = null;
let activeHandle: Awaited<ReturnType<typeof openDongle>> | null = null;

function currentInventory(): ProbeInventory {
  return {
    devices: selectedDevice ? [summarizeDevice(selectedDevice)] : [],
    openedId: selectedDevice && activeHandle ? deviceId(selectedDevice) : null,
  };
}

async function releaseHandle(): Promise<void> {
  if (!activeHandle) {
    return;
  }
  await activeHandle.release();
  activeHandle = null;
}

function requireHandle() {
  if (!activeHandle) {
    throw new Error("Open the Axon adapter first.");
  }
  return activeHandle;
}

if (webHidSupported()) {
  navigator.hid.addEventListener("disconnect", (event) => {
    if (selectedDevice && event.device === selectedDevice) {
      void releaseHandle();
      selectedDevice = null;
    }
  });
}

mountProbeApp({
  root,
  eyebrow: "WebHID Lab",
  title: "Axon Servo Programmer",
  description:
    "A clean browser workspace for Axon V1.3 setup. Detect the adapter, identify the attached servo, and load the current profile before making mode or configuration changes.",
  bullets: [
    "Use a Chromium-based browser on https:// or http://localhost.",
    "Keep the adapter on the host OS, not inside a VM such as Parallels.",
    "Diagnostics stay tucked away until you open them.",
  ],
  devicePanelTitle: "Selected Device",
  emptyDeviceText: "No device selected.",
  loadEnvironment: async () => ({
    transport: "WebHID",
    secureContext: window.isSecureContext,
    webHidAvailable: webHidSupported(),
    userAgent: navigator.userAgent,
  }),
  loadInventory: async () => currentInventory(),
  requestDevice: {
    label: "Detect Adapter",
    run: async () => {
      await releaseHandle();
      const devices = await requestAxonDevices();
      selectedDevice = devices[0] ?? null;
      return currentInventory();
    },
  },
  reconnectDevice: {
    label: "Use Authorized Adapter",
    run: async () => {
      await releaseHandle();
      const devices = await listAuthorizedAxonDevices();
      selectedDevice = devices[0] ?? null;
      return currentInventory();
    },
  },
  openDevice: {
    label: "Connect",
    run: async () => {
      if (!selectedDevice) {
        throw new Error("No device selected.");
      }
      await releaseHandle();
      activeHandle = await openDongle(selectedDevice);
      return currentInventory();
    },
  },
  closeDevice: {
    label: "Disconnect",
    run: async () => {
      await releaseHandle();
      return currentInventory();
    },
  },
  identifyServo: {
    label: "Detect Servo",
    run: async (): Promise<ProbeIdentifyInfo> => {
      const reply = await identify(requireHandle());
      const replyBytes = new Uint8Array(reply.rawRx);
      return {
        present: reply.present,
        statusHi: hex(reply.statusHi),
        statusLo: hex(reply.statusLo),
        modeByte: reply.modeByte === null ? null : hex(reply.modeByte),
        mode: reply.mode,
        rawRx: hexDump(replyBytes),
      };
    },
  },
  readFullConfig: {
    label: "Load Settings",
    run: async (): Promise<ProbeConfigInfo> => {
      const config = await readFullConfig(requireHandle());
      const configBytes = new Uint8Array(config);
      const modelId = modelIdFromConfig(configBytes);
      const model = findModel(loadCatalog(), modelId);
      const chunkSplit = 59;

      return {
        length: configBytes.length,
        modelId,
        known: Boolean(model),
        modelName: model?.name ?? null,
        docsUrl: model?.docs_url ?? null,
        rawHex: hexDump(configBytes),
        firstChunk: hexDump(configBytes.subarray(0, chunkSplit)),
        secondChunk: hexDump(configBytes.subarray(chunkSplit)),
      };
    },
  },
});
