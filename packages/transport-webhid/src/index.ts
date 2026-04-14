import type { DongleHandle } from "@axon/core/driver/transport";
import type { ProbeCollectionInfo, ProbeDeviceInfo } from "@axon/ui";

export const VID = 0x0471;
export const PID = 0x13aa;
export const REPORT_SIZE = 64;
const ECHO_COMMANDS = new Set([0x8a, 0xcd, 0xcb]);

interface InputReportReply {
  reportId: number;
  data: Uint8Array;
}

interface PendingRead {
  resolve: (reply: InputReportReply) => void;
  reject: (error: Error) => void;
  timer: number;
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

export class WebHidDongle implements DongleHandle {
  private readonly replies: InputReportReply[] = [];
  private pendingRead: PendingRead | null = null;
  private readonly onInputReport: EventListener;

  constructor(private readonly device: HIDDevice) {
    this.onInputReport = (event) => {
      const hidEvent = event as HIDInputReportEvent;

      if (hidEvent.device !== this.device) {
        return;
      }

      const reply = {
        reportId: hidEvent.reportId,
        data: new Uint8Array(
          hidEvent.data.buffer.slice(
            hidEvent.data.byteOffset,
            hidEvent.data.byteOffset + hidEvent.data.byteLength,
          ),
        ),
      };

      // Some browser/WebHID stacks surface our own outbound report payload back
      // through `inputreport`. Those frames start with the command byte because
      // the report ID is delivered separately. Ignore them so protocol reads only
      // see device replies.
      const echoedCommand = reply.data[0];
      if (echoedCommand !== undefined && ECHO_COMMANDS.has(echoedCommand)) {
        return;
      }

      if (this.pendingRead) {
        const pending = this.pendingRead;
        this.pendingRead = null;
        window.clearTimeout(pending.timer);
        pending.resolve(reply);
        return;
      }

      this.replies.push(reply);
    };

    this.device.addEventListener("inputreport", this.onInputReport);
  }

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

    const queued = this.replies.shift();
    if (queued) {
      return Buffer.from([queued.reportId, ...queued.data]);
    }

    const reply = await new Promise<InputReportReply>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingRead = null;
        reject(new Error(`Timed out waiting for input report after ${timeoutMs} ms`));
      }, timeoutMs);

      this.pendingRead = { resolve, reject, timer };
    });
    return Buffer.from([reply.reportId, ...reply.data]);
  }

  async release(): Promise<void> {
    if (this.pendingRead) {
      window.clearTimeout(this.pendingRead.timer);
      this.pendingRead.reject(new Error("Selected HID device was closed."));
      this.pendingRead = null;
    }
    this.device.removeEventListener("inputreport", this.onInputReport);
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
