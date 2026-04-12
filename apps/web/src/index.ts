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
  eyebrow: "Browser Probe",
  title: "Axon WebHID PoC",
  description:
    "A browser-first control surface for the Axon V1.3 HID adapter. The interface is shared with the desktop probe, while device access stays on a dedicated WebHID transport.",
  bullets: [
    "Use a Chromium-based browser on https:// or http://localhost.",
    "Make sure the adapter is owned by the host OS, not a VM such as Parallels.",
    "This PoC enumerates, identifies, and reads config. It does not write or flash firmware.",
  ],
  referenceImage: {
    src: "./legacy-programming-software.png",
    alt: "Legacy Axon programming software reference screenshot",
    caption:
      "Legacy vendor software. Useful as a workflow reference, but the point of this shell is to replace that cramped, opaque experience with something clearer.",
  },
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
    label: "Request Axon Adapter",
    run: async () => {
      await releaseHandle();
      const devices = await requestAxonDevices();
      selectedDevice = devices[0] ?? null;
      return currentInventory();
    },
  },
  reconnectDevice: {
    label: "Reuse Authorized Device",
    run: async () => {
      await releaseHandle();
      const devices = await listAuthorizedAxonDevices();
      selectedDevice = devices[0] ?? null;
      return currentInventory();
    },
  },
  openDevice: {
    label: "Open Device",
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
    label: "Close Device",
    run: async () => {
      await releaseHandle();
      return currentInventory();
    },
  },
  identifyServo: {
    label: "Identify",
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
    label: "Read Full Config",
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
