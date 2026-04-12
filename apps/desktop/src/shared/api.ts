type EmptySchema = Record<never, never>;

export interface SerializedAxonError {
  message: string;
  code?: number;
  category?: string;
  hint?: string;
}

export interface RpcOk<T> {
  ok: true;
  data: T;
}

export interface RpcErr {
  ok: false;
  error: SerializedAxonError;
}

export type RpcResult<T> = RpcOk<T> | RpcErr;

export interface RuntimeInfo {
  transport: string;
  platform: string;
  arch: string;
  bunVersion: string;
  renderer: string;
}

export interface AdapterInfo {
  path: string | null;
  vendorId: string | null;
  productId: string | null;
  product: string | null;
  manufacturer: string | null;
  serialNumber: string | null;
  interface: number | null;
  usagePage: string | null;
  usage: string | null;
}

export interface AdapterInventory {
  adapters: AdapterInfo[];
  openedPath: string | null;
}

export interface IdentifyInfo {
  present: boolean;
  statusHi: string;
  statusLo: string;
  modeByte: string | null;
  mode: string;
  rawRx: string;
}

export interface ConfigInfo {
  length: number;
  modelId: string;
  known: boolean;
  modelName: string | null;
  docsUrl: string | null;
  rawHex: string;
  firstChunk: string;
  secondChunk: string;
}

export type DesktopPocSchema = {
  bun: {
    requests: {
      getRuntime: { params: undefined; response: RpcResult<RuntimeInfo> };
      refreshAdapters: { params: undefined; response: RpcResult<AdapterInventory> };
      openAdapter: { params: { path?: string } | undefined; response: RpcResult<AdapterInventory> };
      closeAdapter: { params: undefined; response: RpcResult<AdapterInventory> };
      identifyServo: { params: undefined; response: RpcResult<IdentifyInfo> };
      readFullConfig: { params: undefined; response: RpcResult<ConfigInfo> };
    };
    messages: EmptySchema;
  };
  webview: {
    requests: EmptySchema;
    messages: EmptySchema;
  };
};
