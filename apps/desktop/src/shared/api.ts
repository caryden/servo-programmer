import type { ProbeConfigInfo, ProbeIdentifyInfo, ProbeInventory } from "@axon/ui";

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

export type DesktopPocSchema = {
  bun: {
    requests: {
      getRuntime: { params: undefined; response: RpcResult<RuntimeInfo> };
      refreshAdapters: { params: undefined; response: RpcResult<ProbeInventory> };
      openAdapter: { params: { path?: string } | undefined; response: RpcResult<ProbeInventory> };
      closeAdapter: { params: undefined; response: RpcResult<ProbeInventory> };
      identifyServo: { params: undefined; response: RpcResult<ProbeIdentifyInfo> };
      readFullConfig: { params: undefined; response: RpcResult<ProbeConfigInfo> };
      writeFullConfig: { params: { bytes: number[] }; response: RpcResult<void> };
    };
    messages: EmptySchema;
  };
  webview: {
    requests: EmptySchema;
    messages: EmptySchema;
  };
};
