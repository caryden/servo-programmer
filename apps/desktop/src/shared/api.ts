import type {
  ProbeConfigInfo,
  ProbeFirmwareFile,
  ProbeFlashProgressEvent,
  ProbeIdentifyInfo,
  ProbeInventory,
  ProbeLoadedFile,
  ProbeSavedFile,
} from "@axon/ui";

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

export type FlashJobResult = { ok: true } | { ok: false; error: SerializedAxonError };

export type DesktopPocSchema = {
  bun: {
    requests: {
      getRuntime: { params: undefined; response: RpcResult<RuntimeInfo> };
      refreshAdapters: { params: undefined; response: RpcResult<ProbeInventory> };
      reconnectAdapter: { params: undefined; response: RpcResult<ProbeInventory> };
      openAdapter: { params: { path?: string } | undefined; response: RpcResult<ProbeInventory> };
      closeAdapter: { params: undefined; response: RpcResult<ProbeInventory> };
      identifyServo: { params: undefined; response: RpcResult<ProbeIdentifyInfo> };
      readFullConfig: { params: undefined; response: RpcResult<ProbeConfigInfo> };
      writeFullConfig: { params: { bytes: number[] }; response: RpcResult<void> };
      startFlashModeChange: {
        params: { targetMode: "servo_mode" | "cr_mode"; modelId: string };
        response: RpcResult<void>;
      };
      startFlashFirmwareFile: {
        params: { bytes: number[]; expectedModelId?: string };
        response: RpcResult<void>;
      };
      loadConfigFile: { params: undefined; response: RpcResult<ProbeLoadedFile | null> };
      loadFirmwareFile: { params: undefined; response: RpcResult<ProbeFirmwareFile | null> };
      saveAxonFile: {
        params: { suggestedName: string; text: string };
        response: RpcResult<ProbeSavedFile>;
      };
      exportSvoFile: {
        params: { suggestedName: string; bytes: number[] };
        response: RpcResult<ProbeSavedFile>;
      };
    };
    messages: EmptySchema;
  };
  webview: {
    requests: EmptySchema;
    messages: {
      inventory: ProbeInventory;
      transportLog: string;
      flashProgress: ProbeFlashProgressEvent;
      flashResult: FlashJobResult;
    };
  };
};
