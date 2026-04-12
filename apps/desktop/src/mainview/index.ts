import { Electroview } from "electrobun/view";
import type {
  AdapterInventory,
  ConfigInfo,
  DesktopPocSchema,
  IdentifyInfo,
  RpcResult,
  RuntimeInfo,
  SerializedAxonError,
} from "../shared/api.ts";

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Electrobun PoC DOM did not initialize correctly for ${selector}`);
  }
  return element;
}

const refreshButton = mustQuery<HTMLButtonElement>("#refreshAdapters");
const openButton = mustQuery<HTMLButtonElement>("#openAdapter");
const identifyButton = mustQuery<HTMLButtonElement>("#identifyServo");
const readButton = mustQuery<HTMLButtonElement>("#readConfig");
const closeButton = mustQuery<HTMLButtonElement>("#closeAdapter");

const environmentEl = mustQuery<HTMLElement>("#environment");
const deviceInfoEl = mustQuery<HTMLElement>("#deviceInfo");
const latestReplyEl = mustQuery<HTMLElement>("#latestReply");
const logEl = mustQuery<HTMLElement>("#log");

const rpc = Electroview.defineRPC<DesktopPocSchema>({
  handlers: {
    requests: {},
    messages: {},
  },
});

new Electroview({ rpc });

let openedPath: string | null = null;
let lastInventory: AdapterInventory | null = null;

function log(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  logEl.textContent += `[${timestamp}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function renderButtons() {
  const visibleCount = lastInventory?.adapters.length ?? 0;
  const isOpen = openedPath !== null;
  openButton.disabled = visibleCount === 0 || isOpen;
  identifyButton.disabled = !isOpen;
  readButton.disabled = !isOpen;
  closeButton.disabled = !isOpen;
}

function renderInventory(inventory: AdapterInventory) {
  lastInventory = inventory;
  openedPath = inventory.openedPath;
  const payload = {
    openedPath: inventory.openedPath,
    visibleCount: inventory.adapters.length,
    adapters: inventory.adapters,
  };
  deviceInfoEl.textContent = JSON.stringify(payload, null, 2);
  renderButtons();
}

function renderEnvironment(info: RuntimeInfo) {
  environmentEl.textContent = JSON.stringify(info, null, 2);
}

function renderLatest(value: unknown) {
  latestReplyEl.textContent = JSON.stringify(value, null, 2);
}

function describeError(error: SerializedAxonError): string {
  const out = [`${error.category ?? "internal"}: ${error.message}`];
  if (error.hint) {
    out.push(`hint: ${error.hint}`);
  }
  return out.join("\n");
}

async function handleResult<T>(
  promise: Promise<RpcResult<T>>,
  onOk: (data: T) => void,
  successMessage: string,
) {
  const result = await promise;
  if (!result.ok) {
    renderLatest({ error: result.error });
    log(`error: ${describeError(result.error)}`);
    return;
  }
  onOk(result.data);
  log(successMessage);
}

async function refreshAdapters() {
  await handleResult(
    rpc.request.refreshAdapters(),
    (data) => {
      renderInventory(data);
      renderLatest({
        visibleCount: data.adapters.length,
        openedPath: data.openedPath,
      });
    },
    "adapter inventory refreshed",
  );
}

async function loadRuntime() {
  await handleResult(
    rpc.request.getRuntime(),
    (data) => {
      renderEnvironment(data);
    },
    "runtime info loaded",
  );
}

async function openAdapter() {
  await handleResult(
    rpc.request.openAdapter(),
    (data) => {
      renderInventory(data);
      renderLatest({
        openedPath: data.openedPath,
        visibleCount: data.adapters.length,
      });
    },
    "adapter opened",
  );
}

async function closeAdapter() {
  await handleResult(
    rpc.request.closeAdapter(),
    (data) => {
      renderInventory(data);
      renderLatest({
        openedPath: data.openedPath,
        visibleCount: data.adapters.length,
      });
    },
    "adapter closed",
  );
}

async function identifyServo() {
  await handleResult(
    rpc.request.identifyServo(),
    (data: IdentifyInfo) => {
      renderLatest(data);
    },
    "identify completed",
  );
}

async function readConfig() {
  await handleResult(
    rpc.request.readFullConfig(),
    (data: ConfigInfo) => {
      renderLatest(data);
    },
    "full config read completed",
  );
}

refreshButton.addEventListener("click", () => {
  void refreshAdapters();
});
openButton.addEventListener("click", () => {
  void openAdapter();
});
identifyButton.addEventListener("click", () => {
  void identifyServo();
});
readButton.addEventListener("click", () => {
  void readConfig();
});
closeButton.addEventListener("click", () => {
  void closeAdapter();
});

void loadRuntime();
void refreshAdapters();
