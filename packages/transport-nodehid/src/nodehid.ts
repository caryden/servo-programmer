/**
 * Runtime loader for node-hid's platform-specific N-API prebuilds.
 *
 * We intentionally bypass node-hid's default pkg-prebuilds loader here.
 * Bun standalone executables can embed `.node` addons when they are
 * required directly, but node-hid resolves its addon through a dynamic
 * `__dirname`-based search that bakes the build-machine path into the
 * compiled binary. That works on the build host and fails everywhere else.
 *
 * By selecting the prebuild ourselves with static require() calls, Bun can
 * embed the addon into the executable and the release binary remains
 * portable across machines.
 */

export interface NodeHidDevice {
  path?: string;
  vendorId?: number;
  productId?: number;
  product?: string;
  manufacturer?: string;
  serialNumber?: string;
  release?: number;
  interface?: number;
  usagePage?: number;
  usage?: number;
}

export interface NodeHidHandle {
  write(data: number[]): number;
  readTimeout(timeoutMs: number): number[] | undefined;
  close(): void;
}

export interface NodeHidBinding {
  devices(vendorId?: number, productId?: number): NodeHidDevice[];
  HID: new (path: string) => NodeHidHandle;
}

let cachedBinding: NodeHidBinding | undefined;

function loadBindingForCurrentPlatform(): NodeHidBinding {
  switch (`${process.platform}/${process.arch}`) {
    case "darwin/arm64":
      return require("../node_modules/node-hid/prebuilds/HID-darwin-arm64/node-napi-v4.node");
    case "darwin/x64":
      return require("../node_modules/node-hid/prebuilds/HID-darwin-x64/node-napi-v4.node");
    case "linux/arm64":
      return require("../node_modules/node-hid/prebuilds/HID_hidraw-linux-arm64/node-napi-v4.node");
    case "linux/x64":
      return require("../node_modules/node-hid/prebuilds/HID_hidraw-linux-x64/node-napi-v4.node");
    case "win32/x64":
      return require("../node_modules/node-hid/prebuilds/HID-win32-x64/node-napi-v4.node");
    default:
      throw new Error(
        `Unsupported platform for embedded node-hid prebuild: ${process.platform}/${process.arch}`,
      );
  }
}

export function getNodeHidBinding(): NodeHidBinding {
  cachedBinding ??= loadBindingForCurrentPlatform();
  return cachedBinding;
}
