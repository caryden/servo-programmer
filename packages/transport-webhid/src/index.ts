import type { DongleHandle } from "@axon/core/driver/transport";
import type { ProbeCollectionInfo, ProbeDeviceInfo } from "@axon/ui";

export const VID = 0x0471;
export const PID = 0x13aa;
export const REPORT_SIZE = 64;

interface InputReportReply {
  reportId: number;
  data: Uint8Array;
}

function hex(value: number, width = 2): string {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function summarizeCollections(device: HIDDevice): ProbeCollectionInfo[] {
  return device.collections.map((collection) => ({
    usagePage: hex(collection.usagePage, 4),
    usage: hex(collection.usage, 4),
    inputReports: collection.inputReports.map((report) => report.reportId),
    outputReports: collection.outputReports.map((report) => report.reportId),
    featureReports: collection.featureReports.map((report) => report.reportId),
  }));
}

export function webHidSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

export function deviceId(device: HIDDevice): string {
  return `${hex(device.vendorId, 4)}:${hex(device.productId, 4)}:${device.productName}`;
}

export function summarizeDevice(device: HIDDevice): ProbeDeviceInfo {
  return {
    id: deviceId(device),
    vendorId: hex(device.vendorId, 4),
    productId: hex(device.productId, 4),
    product: device.productName,
    manufacturer: null,
    serialNumber: null,
    interface: null,
    usagePage: null,
    usage: null,
    opened: device.opened,
    collections: summarizeCollections(device),
  };
}

function axonFilter(device: HIDDevice): boolean {
  return device.vendorId === VID && device.productId === PID;
}

export async function listAuthorizedAxonDevices(): Promise<HIDDevice[]> {
  if (!webHidSupported()) {
    throw new Error("WebHID is not available in this browser.");
  }
  const devices = await navigator.hid.getDevices();
  return devices.filter(axonFilter);
}

export async function requestAxonDevices(): Promise<HIDDevice[]> {
  if (!webHidSupported()) {
    throw new Error("WebHID is not available in this browser.");
  }
  return navigator.hid.requestDevice({
    filters: [{ vendorId: VID, productId: PID }],
  });
}

function waitForInputReport(device: HIDDevice, timeoutMs: number): Promise<InputReportReply> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      device.removeEventListener("inputreport", onInputReport);
      reject(new Error(`Timed out waiting for input report after ${timeoutMs} ms`));
    }, timeoutMs);

    const onInputReport: EventListener = (event) => {
      const hidEvent = event as HIDInputReportEvent;

      if (hidEvent.device !== device) {
        return;
      }

      window.clearTimeout(timer);
      device.removeEventListener("inputreport", onInputReport);

      resolve({
        reportId: hidEvent.reportId,
        data: new Uint8Array(
          hidEvent.data.buffer.slice(
            hidEvent.data.byteOffset,
            hidEvent.data.byteOffset + hidEvent.data.byteLength,
          ),
        ),
      });
    };

    device.addEventListener("inputreport", onInputReport);
  });
}

export class WebHidDongle implements DongleHandle {
  constructor(private readonly device: HIDDevice) {}

  async write(data: Buffer): Promise<void> {
    if (!this.device.opened) {
      throw new Error("Selected HID device is not open.");
    }

    const reportId = data[0] ?? 0x00;
    const payload = new Uint8Array(data.subarray(1, REPORT_SIZE));
    await this.device.sendReport(reportId, payload);
  }

  async read(timeoutMs = 1000): Promise<Buffer> {
    if (!this.device.opened) {
      throw new Error("Selected HID device is not open.");
    }

    const reply = await waitForInputReport(this.device, timeoutMs);
    return Buffer.from([reply.reportId, ...reply.data]);
  }

  async release(): Promise<void> {
    if (this.device.opened) {
      await this.device.close();
    }
  }
}

export async function openDongle(device: HIDDevice): Promise<WebHidDongle> {
  if (!device.opened) {
    await device.open();
  }

  return new WebHidDongle(device);
}
