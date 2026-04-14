import { Buffer } from "node:buffer";
import { findModel, loadCatalog } from "@axon/core/catalog";
import { servoModeLabel, summarizeConfig } from "@axon/core/config-summary";
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
const appRoot: HTMLElement = root;
const url = new URL(window.location.href);
const debugEnabled = url.searchParams.has("debug");
const demoEnabled = url.searchParams.has("demo");

if (!("Buffer" in globalThis)) {
  Object.assign(globalThis, { Buffer });
}

let selectedDevice: HIDDevice | null = null;
let activeHandle: Awaited<ReturnType<typeof openDongle>> | null = null;
let lastIdentifyMode: ProbeIdentifyInfo["mode"] = "unknown";
const PERMISSION_HINT_KEY = "axon-webhid-permission-granted";
const transportLogListeners = new Set<(message: string) => void>();

function debugLog(message: string, extra?: unknown): void {
  const uiMessage =
    extra === undefined
      ? `[transport] ${message}`
      : `[transport] ${message} ${JSON.stringify(extra)}`;
  for (const listener of transportLogListeners) {
    listener(uiMessage);
  }
}

function getPermissionHint(): boolean {
  try {
    return window.localStorage.getItem(PERMISSION_HINT_KEY) === "true";
  } catch {
    return false;
  }
}

function setPermissionHint(): void {
  try {
    window.localStorage.setItem(PERMISSION_HINT_KEY, "true");
  } catch {}
}

function currentInventory(): ProbeInventory {
  return {
    devices: selectedDevice ? [summarizeDevice(selectedDevice)] : [],
    openedId: selectedDevice && activeHandle ? deviceId(selectedDevice) : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function releaseHandle(): Promise<void> {
  if (!activeHandle) {
    return;
  }
  try {
    await activeHandle.release();
  } catch {}
  activeHandle = null;
}

function isRecoverableTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Failed to write the report.") ||
    error.message.includes("Selected HID device is not open.") ||
    error.message.includes("The device must be opened first")
  );
}

async function reopenHandle(): Promise<void> {
  if (!selectedDevice) {
    throw new Error("No device selected.");
  }
  await releaseHandle();
  activeHandle = await openDongle(selectedDevice);
  await sleep(120);
}

async function withRecoveredHandle<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isRecoverableTransportError(error) || !selectedDevice) {
      throw error;
    }
    debugLog(`${label} transport retry`, error);
    await reopenHandle();
    return await run();
  }
}

async function refreshAuthorizedInventory(): Promise<ProbeInventory> {
  if (!webHidSupported()) {
    return currentInventory();
  }
  const devices = await listAuthorizedAxonDevices();
  debugLog("getDevices()", {
    count: devices.length,
    products: devices.map((device) => device.productName),
  });
  if (devices.length > 0) {
    setPermissionHint();
  }
  const selectedId = selectedDevice ? deviceId(selectedDevice) : null;
  selectedDevice =
    devices.find((device) => selectedId !== null && deviceId(device) === selectedId) ??
    devices[0] ??
    null;
  return currentInventory();
}

function requireHandle() {
  if (!activeHandle) {
    throw new Error("Open the Axon adapter first.");
  }
  return activeHandle;
}

async function syncAuthorizedDevices(): Promise<ProbeInventory> {
  const previousId = selectedDevice ? deviceId(selectedDevice) : null;
  const inventory = await refreshAuthorizedInventory();
  const nextId = selectedDevice ? deviceId(selectedDevice) : null;
  debugLog("syncAuthorizedDevices()", { previousId, nextId, opened: Boolean(activeHandle) });
  if (activeHandle && previousId && previousId !== nextId) {
    await releaseHandle();
  }
  return inventory;
}

function demoConfig(): ProbeConfigInfo {
  return {
    length: 95,
    modelId: "SA20BHS*",
    known: true,
    modelName: "Axon Micro",
    docsUrl: "https://docs.axon-robotics.com/servos/micro",
    mode: "servo_mode",
    modeLabel: "Servo Mode",
    setup: {
      rangeDegrees: 178,
      rangePercent: 50,
      neutralUs: 0,
      neutralPercent: 50,
      pwmLossBehavior: "hold",
      inversion: "normal",
      softStart: true,
      sensitivityStep: 4,
      sensitivityLabel: "High",
      dampeningFactor: 166,
      overloadProtectionEnabled: true,
      overloadLevels: [
        { pct: 55, sec: 4.0 },
        { pct: 75, sec: 2.0 },
        { pct: 100, sec: 0.8 },
      ],
      pwmPowerPercent: 85,
      proptlSeconds: 25.5,
    },
    rawHex: "",
    firstChunk: "",
    secondChunk: "",
    rawBytes: null,
  };
}

function mountDemoApp(): void {
  let connected = true;
  const servoPresent = true;
  const currentConfig = demoConfig();

  const inventory = (): ProbeInventory => ({
    devices: connected
      ? [
          {
            id: "demo-axon-adapter",
            vendorId: "0x0471",
            productId: "0x13aa",
            product: "USB Bootloader V1.3",
            manufacturer: "Stone Laboratories inc.",
            serialNumber: null,
            interface: null,
            usagePage: null,
            usage: null,
            opened: connected,
          },
        ]
      : [],
    openedId: connected ? "demo-axon-adapter" : null,
  });

  mountProbeApp({
    root: appRoot,
    autoConnectOnLoad: true,
    debugEnabled,
    initialAuthorizedAccess: true,
    livePollIntervalMs: 0,
    eyebrow: "Web Demo",
    title: "Axon Servo Programmer",
    description: "Deterministic browser demo for UI validation.",
    bullets: ["No hardware required.", "Use this mode for Playwright and visual iteration."],
    loadEnvironment: async () => ({
      transport: "demo",
      secureContext: window.isSecureContext,
      webHidAvailable: true,
      userAgent: navigator.userAgent,
    }),
    loadInventory: async () => inventory(),
    requestDevice: {
      label: "Grant Permission",
      run: async () => {
        connected = true;
        return inventory();
      },
    },
    reconnectDevice: {
      label: "Reconnect",
      run: async () => inventory(),
    },
    openDevice: {
      label: "Connect",
      run: async () => {
        connected = true;
        return inventory();
      },
    },
    closeDevice: {
      label: "Disconnect",
      run: async () => {
        connected = false;
        return inventory();
      },
    },
    identifyServo: {
      label: "Identify",
      run: async () => ({
        present: connected && servoPresent,
        statusHi: "0x01",
        statusLo: connected && servoPresent ? "0x00" : "0xfa",
        modeByte: connected && servoPresent ? "0x03" : null,
        mode: connected && servoPresent ? "servo_mode" : "unknown",
        rawRx: "",
      }),
    },
    readFullConfig: {
      label: "Read",
      run: async () => {
        if (!connected || !servoPresent) {
          throw new Error("Servo not detected.");
        }
        return currentConfig;
      },
    },
  });
}

if (demoEnabled) {
  mountDemoApp();
} else {
  mountProbeApp({
    root: appRoot,
    autoConnectOnLoad: true,
    debugEnabled,
    initialAuthorizedAccess: getPermissionHint(),
    livePollIntervalMs: 1000,
    subscribeTransportLog: (push) => {
      transportLogListeners.add(push);
      return () => {
        transportLogListeners.delete(push);
      };
    },
    watchInventory: (onInventory) => {
      if (!webHidSupported()) {
        return;
      }

      let stopped = false;
      let syncing = false;

      const refresh = async () => {
        if (stopped || syncing) return;
        syncing = true;
        try {
          onInventory(await syncAuthorizedDevices());
        } catch (error) {
          debugLog("watch refresh failed", error);
        } finally {
          syncing = false;
        }
      };

      const onConnect = () => {
        debugLog("navigator.hid connect event");
        void refresh();
      };

      const onDisconnect = () => {
        debugLog("navigator.hid disconnect event");
        void refresh();
      };

      navigator.hid.addEventListener("connect", onConnect);
      navigator.hid.addEventListener("disconnect", onDisconnect);
      const timer = window.setInterval(() => {
        void refresh();
      }, 1000);

      return () => {
        stopped = true;
        window.clearInterval(timer);
        navigator.hid.removeEventListener("connect", onConnect);
        navigator.hid.removeEventListener("disconnect", onDisconnect);
      };
    },
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
    loadInventory: async () => refreshAuthorizedInventory(),
    requestDevice: {
      label: "Find Adapter",
      run: async () => {
        debugLog("requestDevice()");
        const devices = await requestAxonDevices();
        debugLog("requestDevice() resolved", {
          count: devices.length,
          products: devices.map((device) => device.productName),
        });
        setPermissionHint();
        await releaseHandle();
        selectedDevice = devices[0] ?? null;
        return currentInventory();
      },
    },
    reconnectDevice: {
      label: "Use Remembered Adapter",
      run: async () => {
        debugLog("reconnectDevice()");
        await releaseHandle();
        return refreshAuthorizedInventory();
      },
    },
    openDevice: {
      label: "Connect",
      run: async () => {
        if (!selectedDevice) {
          throw new Error("No device selected.");
        }
        debugLog("openDevice()", {
          id: deviceId(selectedDevice),
          product: selectedDevice.productName,
        });
        await reopenHandle();
        debugLog("openDevice() success", { id: deviceId(selectedDevice) });
        return currentInventory();
      },
    },
    closeDevice: {
      label: "Disconnect",
      run: async () => {
        debugLog("closeDevice()");
        await releaseHandle();
        return currentInventory();
      },
    },
    identifyServo: {
      label: "Find Servo",
      run: async (): Promise<ProbeIdentifyInfo> => {
        const reply = await withRecoveredHandle("identify", async () => identify(requireHandle()));
        lastIdentifyMode = reply.mode;
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
      label: "Show Current Setup",
      run: async (): Promise<ProbeConfigInfo> => {
        const config = await withRecoveredHandle("readFullConfig", async () =>
          readFullConfig(requireHandle()),
        );
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
          mode: lastIdentifyMode,
          modeLabel: servoModeLabel(lastIdentifyMode),
          setup: summarizeConfig(configBytes, modelId),
          rawHex: hexDump(configBytes),
          firstChunk: hexDump(configBytes.subarray(0, chunkSplit)),
          secondChunk: hexDump(configBytes.subarray(chunkSplit)),
          rawBytes: Array.from(configBytes),
        };
      },
    },
  });
}
