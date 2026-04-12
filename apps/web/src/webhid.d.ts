interface HIDReportInfo {
  reportId: number;
}

interface HIDCollectionInfo {
  usagePage: number;
  usage: number;
  inputReports: HIDReportInfo[];
  outputReports: HIDReportInfo[];
  featureReports: HIDReportInfo[];
}

interface HIDConnectionEvent extends Event {
  device: HIDDevice;
}

interface HIDInputReportEvent extends Event {
  device: HIDDevice;
  reportId: number;
  data: DataView;
}

interface HIDDevice extends EventTarget {
  vendorId: number;
  productId: number;
  productName: string;
  opened: boolean;
  collections: HIDCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
}

interface HID {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: {
    filters: Array<{ vendorId?: number; productId?: number }>;
  }): Promise<HIDDevice[]>;
  addEventListener(
    type: "disconnect",
    listener: (event: HIDConnectionEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

interface Navigator {
  hid: HID;
}
