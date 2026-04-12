const STYLE_ID = "axon-probe-ui-style";

export interface ProbeCollectionInfo {
  usagePage: string;
  usage: string;
  inputReports: number[];
  outputReports: number[];
  featureReports: number[];
}

export interface ProbeDeviceInfo {
  id: string | null;
  vendorId: string | null;
  productId: string | null;
  product: string | null;
  manufacturer: string | null;
  serialNumber: string | null;
  interface: number | null;
  usagePage: string | null;
  usage: string | null;
  opened?: boolean;
  collections?: ProbeCollectionInfo[];
}

export interface ProbeInventory {
  devices: ProbeDeviceInfo[];
  openedId: string | null;
}

export interface ProbeIdentifyInfo {
  present: boolean;
  statusHi: string;
  statusLo: string;
  modeByte: string | null;
  mode: string;
  rawRx: string;
}

export interface ProbeConfigInfo {
  length: number;
  modelId: string;
  known: boolean;
  modelName: string | null;
  docsUrl: string | null;
  rawHex: string;
  firstChunk: string;
  secondChunk: string;
}

export interface ProbeUiAction<T> {
  label: string;
  run: () => Promise<T>;
}

export interface ProbeUiOptions {
  root: HTMLElement;
  title: string;
  description: string;
  bullets: string[];
  devicePanelTitle: string;
  emptyDeviceText: string;
  loadEnvironment: () => Promise<unknown>;
  loadInventory: () => Promise<ProbeInventory>;
  refreshInventory?: ProbeUiAction<ProbeInventory>;
  requestDevice?: ProbeUiAction<ProbeInventory>;
  reconnectDevice?: ProbeUiAction<ProbeInventory>;
  openDevice: ProbeUiAction<ProbeInventory>;
  closeDevice: ProbeUiAction<ProbeInventory>;
  identifyServo: ProbeUiAction<ProbeIdentifyInfo>;
  readFullConfig: ProbeUiAction<ProbeConfigInfo>;
}

function installStyles(document: Document) {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      margin: 0;
      padding: 24px;
      line-height: 1.45;
    }

    main {
      max-width: 960px;
    }

    h1, h2, p, ul {
      margin: 0 0 16px;
    }

    .axon-probe-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 16px;
    }

    .axon-probe-row button {
      border: 1px solid currentColor;
      border-radius: 6px;
      background: transparent;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
    }

    .axon-probe-row button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .axon-probe-grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      margin: 0 0 16px;
    }

    .axon-probe-panel {
      border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
      border-radius: 6px;
      padding: 12px;
    }

    .axon-probe-panel pre {
      overflow: auto;
      padding: 12px;
      border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
      border-radius: 6px;
      margin: 0;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, "Liberation Mono", monospace;
    }
  `;

  document.head.appendChild(style);
}

function mustQuery<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Axon probe UI missing required selector ${selector}`);
  }
  return element;
}

function toJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function summarizeInventory(inventory: ProbeInventory): object {
  return {
    openedId: inventory.openedId,
    visibleCount: inventory.devices.length,
    devices: inventory.devices,
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function mountProbeApp(options: ProbeUiOptions): void {
  const document = options.root.ownerDocument;
  installStyles(document);

  options.root.innerHTML = `
    <main>
      <h1>${options.title}</h1>
      <p>${options.description}</p>
      <ul>${options.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}</ul>
      <div class="axon-probe-row" data-role="actions"></div>
      <div class="axon-probe-grid">
        <section class="axon-probe-panel">
          <h2>Environment</h2>
          <pre data-role="environment">Loading runtime info...</pre>
        </section>
        <section class="axon-probe-panel">
          <h2>${options.devicePanelTitle}</h2>
          <pre data-role="devices">${options.emptyDeviceText}</pre>
        </section>
        <section class="axon-probe-panel">
          <h2>Latest Reply</h2>
          <pre data-role="latest">No traffic yet.</pre>
        </section>
      </div>
      <section>
        <h2>Log</h2>
        <pre data-role="log"></pre>
      </section>
    </main>
  `;

  const actionsEl = mustQuery<HTMLDivElement>(options.root, '[data-role="actions"]');
  const environmentEl = mustQuery<HTMLElement>(options.root, '[data-role="environment"]');
  const devicesEl = mustQuery<HTMLElement>(options.root, '[data-role="devices"]');
  const latestEl = mustQuery<HTMLElement>(options.root, '[data-role="latest"]');
  const logEl = mustQuery<HTMLElement>(options.root, '[data-role="log"]');

  const buttons = new Map<string, HTMLButtonElement>();
  let inventory: ProbeInventory = { devices: [], openedId: null };

  function log(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    logEl.textContent += `[${timestamp}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderInventory(next: ProbeInventory) {
    inventory = next;
    devicesEl.textContent =
      next.devices.length === 0 ? options.emptyDeviceText : toJson(summarizeInventory(next));
    updateButtons();
  }

  function renderLatest(value: unknown) {
    latestEl.textContent = toJson(value);
  }

  function updateButtons() {
    const hasDevice = inventory.devices.length > 0;
    const isOpen = inventory.openedId !== null;

    buttons.get("open")?.toggleAttribute("disabled", !hasDevice || isOpen);
    buttons.get("identify")?.toggleAttribute("disabled", !isOpen);
    buttons.get("read")?.toggleAttribute("disabled", !isOpen);
    buttons.get("close")?.toggleAttribute("disabled", !isOpen);
  }

  function addButton(key: string, label: string, onClick: () => Promise<void>) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      void onClick();
    });
    actionsEl.appendChild(button);
    buttons.set(key, button);
  }

  async function runAction<T>(
    action: ProbeUiAction<T>,
    onSuccess: (data: T) => void,
    successMessage: string,
  ) {
    try {
      const data = await action.run();
      onSuccess(data);
      log(successMessage);
    } catch (error) {
      renderLatest({ error: formatError(error) });
      log(`error: ${formatError(error)}`);
    }
  }

  if (options.requestDevice) {
    const requestDevice = options.requestDevice;
    addButton("request", options.requestDevice.label, async () => {
      await runAction(
        requestDevice,
        (data) => {
          renderInventory(data);
          renderLatest(summarizeInventory(data));
        },
        "device request completed",
      );
    });
  }

  if (options.reconnectDevice) {
    const reconnectDevice = options.reconnectDevice;
    addButton("reconnect", options.reconnectDevice.label, async () => {
      await runAction(
        reconnectDevice,
        (data) => {
          renderInventory(data);
          renderLatest(summarizeInventory(data));
        },
        "authorized device lookup completed",
      );
    });
  }

  if (options.refreshInventory) {
    const refreshInventory = options.refreshInventory;
    addButton("refresh", options.refreshInventory.label, async () => {
      await runAction(
        refreshInventory,
        (data) => {
          renderInventory(data);
          renderLatest(summarizeInventory(data));
        },
        "adapter inventory refreshed",
      );
    });
  }

  addButton("open", options.openDevice.label, async () => {
    await runAction(
      options.openDevice,
      (data) => {
        renderInventory(data);
        renderLatest(summarizeInventory(data));
      },
      "adapter opened",
    );
  });

  addButton("identify", options.identifyServo.label, async () => {
    await runAction(
      options.identifyServo,
      (data) => {
        renderLatest(data);
      },
      "identify completed",
    );
  });

  addButton("read", options.readFullConfig.label, async () => {
    await runAction(
      options.readFullConfig,
      (data) => {
        renderLatest(data);
      },
      "full config read completed",
    );
  });

  addButton("close", options.closeDevice.label, async () => {
    await runAction(
      options.closeDevice,
      (data) => {
        renderInventory(data);
        renderLatest(summarizeInventory(data));
      },
      "adapter closed",
    );
  });

  updateButtons();

  void (async () => {
    try {
      environmentEl.textContent = toJson(await options.loadEnvironment());
      log("runtime info loaded");
    } catch (error) {
      environmentEl.textContent = toJson({ error: formatError(error) });
      log(`error: ${formatError(error)}`);
    }
  })();

  void (async () => {
    try {
      renderInventory(await options.loadInventory());
      log("inventory loaded");
    } catch (error) {
      devicesEl.textContent = toJson({ error: formatError(error) });
      log(`error: ${formatError(error)}`);
    }
  })();
}
