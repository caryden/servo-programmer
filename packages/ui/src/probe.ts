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

export interface ProbeUiImage {
  src: string;
  alt: string;
  caption: string;
}

export interface ProbeUiOptions {
  root: HTMLElement;
  title: string;
  description: string;
  bullets: string[];
  devicePanelTitle: string;
  emptyDeviceText: string;
  eyebrow?: string;
  referenceImage?: ProbeUiImage;
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

type SummaryTone = "neutral" | "good" | "warn" | "bad";

interface SummaryItem {
  label: string;
  value: string;
  tone: SummaryTone;
}

function installStyles(document: Document) {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :root {
      color-scheme: dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --probe-bg: #0f1214;
      --probe-bg-elevated: #171c1f;
      --probe-bg-muted: #111619;
      --probe-border: #2a3337;
      --probe-border-strong: #3d4f4e;
      --probe-text: #f4f7f6;
      --probe-text-muted: #a6b4b0;
      --probe-accent: #5ed9aa;
      --probe-accent-strong: #86f0c8;
      --probe-warn: #f2c86d;
      --probe-danger: #ff7a6e;
      --probe-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, rgba(94, 217, 170, 0.08), transparent 18%),
        linear-gradient(180deg, #101416 0%, #0d1012 100%);
      color: var(--probe-text);
      line-height: 1.45;
    }

    img {
      display: block;
      max-width: 100%;
    }

    a {
      color: var(--probe-accent-strong);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .axon-probe-app {
      width: 100%;
      padding: 20px;
    }

    .axon-probe-shell {
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }

    .axon-probe-top {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(280px, 400px);
      gap: 20px;
      align-items: stretch;
    }

    .axon-probe-intro {
      display: grid;
      gap: 14px;
      padding: 24px;
      border: 1px solid var(--probe-border-strong);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(94, 217, 170, 0.09), rgba(23, 28, 31, 0.92) 42%);
      box-shadow: var(--probe-shadow);
    }

    .axon-probe-eyebrow {
      margin: 0;
      color: var(--probe-accent-strong);
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .axon-probe-title {
      margin: 0;
      font-size: 2.45rem;
      line-height: 1.05;
      max-width: 14ch;
    }

    .axon-probe-description {
      margin: 0;
      max-width: 62ch;
      color: var(--probe-text-muted);
      font-size: 1.02rem;
    }

    .axon-probe-bullets {
      margin: 0;
      padding-left: 1.2rem;
      display: grid;
      gap: 8px;
      color: var(--probe-text-muted);
    }

    .axon-probe-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }

    .axon-probe-metric {
      min-height: 92px;
      padding: 14px;
      border: 1px solid var(--probe-border);
      border-radius: 8px;
      background: rgba(11, 15, 17, 0.78);
      display: grid;
      align-content: start;
      gap: 8px;
    }

    .axon-probe-metric-label {
      font-size: 0.8rem;
      color: var(--probe-text-muted);
      text-transform: uppercase;
      font-weight: 700;
    }

    .axon-probe-metric-value {
      font-size: 1.15rem;
      font-weight: 700;
      word-break: break-word;
    }

    .axon-probe-tone-neutral {
      color: var(--probe-text);
    }

    .axon-probe-tone-good {
      color: var(--probe-accent-strong);
    }

    .axon-probe-tone-warn {
      color: var(--probe-warn);
    }

    .axon-probe-tone-bad {
      color: var(--probe-danger);
    }

    .axon-probe-reference {
      margin: 0;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      overflow: hidden;
      border: 1px solid var(--probe-border-strong);
      border-radius: 8px;
      background: var(--probe-bg-elevated);
      box-shadow: var(--probe-shadow);
    }

    .axon-probe-reference-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      min-height: 260px;
      background: var(--probe-bg-muted);
    }

    .axon-probe-reference-caption {
      margin: 0;
      padding: 12px 14px;
      color: var(--probe-text-muted);
      font-size: 0.92rem;
      border-top: 1px solid var(--probe-border);
      background: rgba(8, 11, 12, 0.88);
    }

    .axon-probe-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .axon-probe-toolbar button {
      min-height: 46px;
      padding: 0 16px;
      border: 1px solid var(--probe-border-strong);
      border-radius: 6px;
      background: var(--probe-bg-elevated);
      color: var(--probe-text);
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      transition:
        transform 120ms ease,
        border-color 120ms ease,
        background 120ms ease;
    }

    .axon-probe-toolbar button:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: var(--probe-accent);
      background: #1b2327;
    }

    .axon-probe-toolbar button[data-action="request"],
    .axon-probe-toolbar button[data-action="refresh"],
    .axon-probe-toolbar button[data-action="open"] {
      background: linear-gradient(180deg, rgba(94, 217, 170, 0.24), rgba(16, 23, 24, 0.94));
    }

    .axon-probe-toolbar button[data-action="read"] {
      border-color: #557a6a;
    }

    .axon-probe-toolbar button[data-action="close"] {
      border-color: #664441;
    }

    .axon-probe-toolbar button:disabled {
      cursor: not-allowed;
      opacity: 0.42;
      transform: none;
    }

    .axon-probe-grid {
      display: grid;
      gap: 20px;
      grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    }

    .axon-probe-panel {
      padding: 18px;
      border: 1px solid var(--probe-border);
      border-radius: 8px;
      background: rgba(18, 22, 25, 0.96);
      min-width: 0;
    }

    .axon-probe-panel-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .axon-probe-panel-title {
      margin: 0;
      font-size: 1.2rem;
    }

    .axon-probe-panel-note {
      color: var(--probe-text-muted);
      font-size: 0.86rem;
    }

    .axon-probe-stack {
      display: grid;
      gap: 18px;
    }

    .axon-probe-empty {
      margin: 0;
      color: var(--probe-text-muted);
    }

    .axon-probe-kv {
      display: grid;
      grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
      gap: 8px 14px;
      margin: 0;
    }

    .axon-probe-kv dt {
      margin: 0;
      color: var(--probe-text-muted);
      font-size: 0.84rem;
      text-transform: uppercase;
      font-weight: 700;
    }

    .axon-probe-kv dd {
      margin: 0;
      word-break: break-word;
    }

    .axon-probe-device-list {
      display: grid;
      gap: 12px;
    }

    .axon-probe-device {
      padding: 14px;
      border: 1px solid var(--probe-border);
      border-radius: 8px;
      background: rgba(10, 14, 15, 0.78);
      display: grid;
      gap: 12px;
    }

    .axon-probe-device-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .axon-probe-device-name {
      margin: 0;
      font-size: 1rem;
    }

    .axon-probe-device-subtitle {
      margin: 4px 0 0;
      color: var(--probe-text-muted);
      font-size: 0.9rem;
    }

    .axon-probe-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .axon-probe-chip {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 0 10px;
      border: 1px solid var(--probe-border-strong);
      border-radius: 999px;
      background: rgba(13, 18, 20, 0.76);
      font-size: 0.82rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .axon-probe-chip.axon-probe-tone-good {
      border-color: rgba(94, 217, 170, 0.45);
    }

    .axon-probe-chip.axon-probe-tone-warn {
      border-color: rgba(242, 200, 109, 0.45);
    }

    .axon-probe-chip.axon-probe-tone-bad {
      border-color: rgba(255, 122, 110, 0.42);
    }

    .axon-probe-subsection + .axon-probe-subsection {
      padding-top: 14px;
      border-top: 1px solid var(--probe-border);
    }

    .axon-probe-subsection-label {
      margin: 0 0 10px;
      font-size: 0.88rem;
      color: var(--probe-text-muted);
      text-transform: uppercase;
      font-weight: 700;
    }

    .axon-probe-pre {
      margin: 0;
      overflow: auto;
      padding: 14px;
      border: 1px solid var(--probe-border);
      border-radius: 6px;
      background: #0c1012;
      color: #d8e0dd;
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 0.86rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .axon-probe-log {
      min-height: 220px;
      max-height: 360px;
    }

    @media (max-width: 1080px) {
      .axon-probe-top {
        grid-template-columns: 1fr;
      }

      .axon-probe-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .axon-probe-reference-image {
        min-height: 220px;
      }
    }

    @media (max-width: 820px) {
      .axon-probe-grid {
        grid-template-columns: 1fr;
      }

      .axon-probe-summary {
        grid-template-columns: 1fr 1fr;
      }

      .axon-probe-title {
        font-size: 2rem;
      }
    }

    @media (max-width: 560px) {
      .axon-probe-app {
        padding: 14px;
      }

      .axon-probe-intro,
      .axon-probe-panel {
        padding: 16px;
      }

      .axon-probe-summary {
        grid-template-columns: 1fr;
      }

      .axon-probe-kv {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function startCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? "—" : value.map((entry) => formatValue(entry)).join(", ");
  }

  return JSON.stringify(value);
}

function isIdentifyInfo(value: unknown): value is ProbeIdentifyInfo {
  return (
    isRecord(value) &&
    typeof value.present === "boolean" &&
    typeof value.statusHi === "string" &&
    typeof value.statusLo === "string" &&
    typeof value.mode === "string" &&
    typeof value.rawRx === "string"
  );
}

function isConfigInfo(value: unknown): value is ProbeConfigInfo {
  return (
    isRecord(value) &&
    typeof value.length === "number" &&
    typeof value.modelId === "string" &&
    typeof value.rawHex === "string"
  );
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
}

function clear(node: Element) {
  node.replaceChildren();
}

function createPre(
  document: Document,
  value: string,
  className = "axon-probe-pre",
): HTMLPreElement {
  const pre = createElement(document, "pre", className);
  pre.textContent = value;
  return pre;
}

function createChip(
  document: Document,
  label: string,
  tone: SummaryTone = "neutral",
): HTMLSpanElement {
  const chip = createElement(document, "span", `axon-probe-chip axon-probe-tone-${tone}`);
  chip.textContent = label;
  return chip;
}

function createKeyValueList(
  document: Document,
  rows: ReadonlyArray<readonly [string, string | Node]>,
): HTMLDListElement {
  const list = createElement(document, "dl", "axon-probe-kv");

  for (const [label, value] of rows) {
    const term = createElement(document, "dt");
    term.textContent = label;

    const detail = createElement(document, "dd");
    if (typeof value === "string") {
      detail.textContent = value;
    } else {
      detail.append(value);
    }

    list.append(term, detail);
  }

  return list;
}

function requireElement<T extends Element>(root: ParentNode, selector: string, message: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(message);
  }
  return element;
}

function makeSummaryItems(
  environment: unknown,
  inventory: ProbeInventory,
  latest: unknown,
): SummaryItem[] {
  const transport =
    isRecord(environment) && typeof environment.transport === "string"
      ? environment.transport
      : "Probe Runtime";

  let servoValue = "Not Probed";
  let servoTone: SummaryTone = "neutral";
  let targetValue = "No Read Yet";
  let targetTone: SummaryTone = "neutral";

  if (isIdentifyInfo(latest)) {
    servoValue = latest.present ? startCase(latest.mode.replace(/_/g, " ")) : "No Servo";
    servoTone = latest.present ? "good" : "warn";
    targetValue = `${latest.statusHi} / ${latest.statusLo}`;
  } else if (isConfigInfo(latest)) {
    servoValue = latest.known ? "Config Ready" : "Unknown Model";
    servoTone = latest.known ? "good" : "warn";
    targetValue =
      latest.modelName ?? (latest.modelId.length > 0 ? latest.modelId : "Unnamed Target");
    targetTone = latest.known ? "good" : "warn";
  }

  return [
    {
      label: "Transport",
      value: transport,
      tone: "neutral",
    },
    {
      label: "Adapters",
      value: inventory.devices.length.toString(),
      tone: inventory.devices.length > 0 ? "good" : "warn",
    },
    {
      label: "Session",
      value: inventory.openedId ? "Open" : "Idle",
      tone: inventory.openedId ? "good" : "neutral",
    },
    {
      label: "Servo",
      value: servoValue,
      tone: servoTone,
    },
    {
      label: "Target",
      value: targetValue,
      tone: targetTone,
    },
  ];
}

function renderSummary(
  document: Document,
  container: HTMLElement,
  environment: unknown,
  inventory: ProbeInventory,
  latest: unknown,
) {
  clear(container);

  const items = makeSummaryItems(environment, inventory, latest);
  for (const item of items) {
    const metric = createElement(document, "section", "axon-probe-metric");
    const label = createElement(document, "p", "axon-probe-metric-label");
    const value = createElement(
      document,
      "p",
      `axon-probe-metric-value axon-probe-tone-${item.tone}`,
    );
    label.textContent = item.label;
    value.textContent = item.value;
    metric.append(label, value);
    container.append(metric);
  }
}

function renderEnvironmentPanel(document: Document, container: HTMLElement, environment: unknown) {
  clear(container);

  if (!isRecord(environment)) {
    container.append(createPre(document, JSON.stringify(environment, null, 2)));
    return;
  }

  const rows = Object.entries(environment).map(
    ([key, value]) => [startCase(key), formatValue(value)] as const,
  );
  container.append(createKeyValueList(document, rows));
}

function renderInventoryPanel(
  document: Document,
  container: HTMLElement,
  inventory: ProbeInventory,
  emptyText: string,
) {
  clear(container);

  if (inventory.devices.length === 0) {
    const empty = createElement(document, "p", "axon-probe-empty");
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  const list = createElement(document, "div", "axon-probe-device-list");

  for (const device of inventory.devices) {
    const item = createElement(document, "article", "axon-probe-device");
    const head = createElement(document, "div", "axon-probe-device-head");
    const titleWrap = createElement(document, "div");
    const title = createElement(document, "h3", "axon-probe-device-name");
    const subtitle = createElement(document, "p", "axon-probe-device-subtitle");
    const chipRow = createElement(document, "div", "axon-probe-chip-row");

    title.textContent = device.product ?? "Axon Adapter";
    subtitle.textContent = device.manufacturer ?? "HID-visible adapter";
    chipRow.append(
      createChip(document, `${device.vendorId ?? "VID?"} / ${device.productId ?? "PID?"}`),
      createChip(document, device.opened ? "Open" : "Idle", device.opened ? "good" : "neutral"),
    );

    titleWrap.append(title, subtitle);
    head.append(titleWrap, chipRow);

    const rows: Array<[string, string]> = [
      ["Endpoint", device.id ?? "—"],
      ["Interface", formatValue(device.interface)],
      ["Usage", device.usagePage && device.usage ? `${device.usagePage} / ${device.usage}` : "—"],
      ["Serial", device.serialNumber ?? "—"],
    ];

    item.append(head, createKeyValueList(document, rows));

    if (device.collections && device.collections.length > 0) {
      const subsection = createElement(document, "div", "axon-probe-subsection");
      const label = createElement(document, "p", "axon-probe-subsection-label");
      label.textContent = "Collections";

      const detail = createElement(document, "div", "axon-probe-chip-row");
      for (const collection of device.collections) {
        detail.append(
          createChip(
            document,
            `${collection.usagePage} / ${collection.usage} · in ${collection.inputReports.length} · out ${collection.outputReports.length}`,
          ),
        );
      }

      subsection.append(label, detail);
      item.append(subsection);
    }

    list.append(item);
  }

  container.append(list);
}

function renderLatestPanel(document: Document, container: HTMLElement, latest: unknown) {
  clear(container);

  if (!latest) {
    const empty = createElement(document, "p", "axon-probe-empty");
    empty.textContent = "No exchange yet.";
    container.append(empty);
    return;
  }

  if (isIdentifyInfo(latest)) {
    const top = createElement(document, "div", "axon-probe-stack");
    const chips = createElement(document, "div", "axon-probe-chip-row");
    chips.append(
      createChip(
        document,
        latest.present ? "Servo Present" : "No Servo",
        latest.present ? "good" : "warn",
      ),
      createChip(document, startCase(latest.mode.replace(/_/g, " "))),
      createChip(document, `${latest.statusHi} / ${latest.statusLo}`),
    );

    const details = createKeyValueList(document, [
      ["Status High", latest.statusHi],
      ["Status Low", latest.statusLo],
      ["Mode Byte", latest.modeByte ?? "—"],
      ["Mode", startCase(latest.mode.replace(/_/g, " "))],
    ]);

    const rawSection = createElement(document, "div", "axon-probe-subsection");
    const rawLabel = createElement(document, "p", "axon-probe-subsection-label");
    rawLabel.textContent = "Raw Reply";
    rawSection.append(rawLabel, createPre(document, latest.rawRx));

    top.append(chips, details, rawSection);
    container.append(top);
    return;
  }

  if (isConfigInfo(latest)) {
    const stack = createElement(document, "div", "axon-probe-stack");
    const chips = createElement(document, "div", "axon-probe-chip-row");
    chips.append(
      createChip(
        document,
        latest.known ? "Catalog Match" : "Unknown Model",
        latest.known ? "good" : "warn",
      ),
      createChip(document, `${latest.length} Bytes`),
      createChip(document, latest.modelId || "No Model ID"),
    );

    const docsValue = latest.docsUrl
      ? (() => {
          const link = createElement(document, "a");
          link.href = latest.docsUrl;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = latest.docsUrl;
          return link;
        })()
      : "—";

    const details = createKeyValueList(document, [
      ["Model", latest.modelName ?? "Unknown"],
      ["Model ID", latest.modelId || "—"],
      ["Known", latest.known ? "Yes" : "No"],
      ["Docs", docsValue],
    ]);

    const chunks = createElement(document, "div", "axon-probe-stack");

    const chunkA = createElement(document, "div", "axon-probe-subsection");
    const chunkALabel = createElement(document, "p", "axon-probe-subsection-label");
    chunkALabel.textContent = "Chunk 0";
    chunkA.append(chunkALabel, createPre(document, latest.firstChunk));

    const chunkB = createElement(document, "div", "axon-probe-subsection");
    const chunkBLabel = createElement(document, "p", "axon-probe-subsection-label");
    chunkBLabel.textContent = "Chunk 1";
    chunkB.append(chunkBLabel, createPre(document, latest.secondChunk));

    const rawSection = createElement(document, "div", "axon-probe-subsection");
    const rawLabel = createElement(document, "p", "axon-probe-subsection-label");
    rawLabel.textContent = "Full Block";
    rawSection.append(rawLabel, createPre(document, latest.rawHex));

    chunks.append(chunkA, chunkB, rawSection);
    stack.append(chips, details, chunks);
    container.append(stack);
    return;
  }

  container.append(createPre(document, JSON.stringify(latest, null, 2)));
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

  const imageMarkup = options.referenceImage
    ? `
        <figure class="axon-probe-reference">
          <img class="axon-probe-reference-image" src="${options.referenceImage.src}" alt="${options.referenceImage.alt}" />
          <figcaption class="axon-probe-reference-caption">${options.referenceImage.caption}</figcaption>
        </figure>
      `
    : "";

  options.root.innerHTML = `
    <main class="axon-probe-app">
      <div class="axon-probe-shell">
        <section class="axon-probe-top">
          <section class="axon-probe-intro">
            ${options.eyebrow ? `<p class="axon-probe-eyebrow">${options.eyebrow}</p>` : ""}
            <h1 class="axon-probe-title">${options.title}</h1>
            <p class="axon-probe-description">${options.description}</p>
            <ul class="axon-probe-bullets">${options.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}</ul>
            <div class="axon-probe-summary" data-role="summary"></div>
          </section>
          ${imageMarkup}
        </section>

        <section class="axon-probe-toolbar" data-role="actions"></section>

        <section class="axon-probe-grid">
          <div class="axon-probe-stack">
            <section class="axon-probe-panel">
              <div class="axon-probe-panel-header">
                <h2 class="axon-probe-panel-title">Environment</h2>
                <span class="axon-probe-panel-note">Runtime snapshot</span>
              </div>
              <div data-role="environment"></div>
            </section>

            <section class="axon-probe-panel">
              <div class="axon-probe-panel-header">
                <h2 class="axon-probe-panel-title">${options.devicePanelTitle}</h2>
                <span class="axon-probe-panel-note">Enumerated through the active transport</span>
              </div>
              <div data-role="devices"></div>
            </section>
          </div>

          <div class="axon-probe-stack">
            <section class="axon-probe-panel">
              <div class="axon-probe-panel-header">
                <h2 class="axon-probe-panel-title">Latest Exchange</h2>
                <span class="axon-probe-panel-note">Parsed response plus raw bytes</span>
              </div>
              <div data-role="latest"></div>
            </section>

            <section class="axon-probe-panel">
              <div class="axon-probe-panel-header">
                <h2 class="axon-probe-panel-title">Session Log</h2>
                <span class="axon-probe-panel-note">Most recent actions and errors</span>
              </div>
              <pre class="axon-probe-pre axon-probe-log" data-role="log"></pre>
            </section>
          </div>
        </section>
      </div>
    </main>
  `;

  const actionsEl = requireElement<HTMLDivElement>(
    options.root,
    '[data-role="actions"]',
    "Axon probe UI failed to initialize the actions region.",
  );
  const summaryEl = requireElement<HTMLDivElement>(
    options.root,
    '[data-role="summary"]',
    "Axon probe UI failed to initialize the summary region.",
  );
  const environmentEl = requireElement<HTMLElement>(
    options.root,
    '[data-role="environment"]',
    "Axon probe UI failed to initialize the environment region.",
  );
  const devicesEl = requireElement<HTMLElement>(
    options.root,
    '[data-role="devices"]',
    "Axon probe UI failed to initialize the devices region.",
  );
  const latestEl = requireElement<HTMLElement>(
    options.root,
    '[data-role="latest"]',
    "Axon probe UI failed to initialize the latest region.",
  );
  const logEl = requireElement<HTMLElement>(
    options.root,
    '[data-role="log"]',
    "Axon probe UI failed to initialize the log region.",
  );

  const buttons = new Map<string, HTMLButtonElement>();

  let environmentState: unknown = null;
  let inventoryState: ProbeInventory = { devices: [], openedId: null };
  let latestState: unknown = null;

  function rerenderSummary() {
    renderSummary(document, summaryEl, environmentState, inventoryState, latestState);
  }

  function log(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    logEl.textContent += `[${timestamp}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderInventory(next: ProbeInventory) {
    inventoryState = next;
    renderInventoryPanel(document, devicesEl, inventoryState, options.emptyDeviceText);
    updateButtons();
    rerenderSummary();
  }

  function renderEnvironment(next: unknown) {
    environmentState = next;
    renderEnvironmentPanel(document, environmentEl, environmentState);
    rerenderSummary();
  }

  function renderLatest(value: unknown) {
    latestState = value;
    renderLatestPanel(document, latestEl, latestState);
    rerenderSummary();
  }

  function updateButtons() {
    const hasDevice = inventoryState.devices.length > 0;
    const isOpen = inventoryState.openedId !== null;

    buttons.get("open")?.toggleAttribute("disabled", !hasDevice || isOpen);
    buttons.get("identify")?.toggleAttribute("disabled", !isOpen);
    buttons.get("read")?.toggleAttribute("disabled", !isOpen);
    buttons.get("close")?.toggleAttribute("disabled", !isOpen);
  }

  function addButton(key: string, label: string, onClick: () => Promise<void>) {
    const button = createElement(document, "button");
    button.type = "button";
    button.dataset.action = key;
    button.textContent = label;
    button.addEventListener("click", () => {
      void onClick();
    });
    actionsEl.append(button);
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
    addButton("request", requestDevice.label, async () => {
      await runAction(
        requestDevice,
        (data) => {
          renderInventory(data);
          renderLatest({ selection: data.openedId ?? "requested" });
        },
        "device request completed",
      );
    });
  }

  if (options.reconnectDevice) {
    const reconnectDevice = options.reconnectDevice;
    addButton("reconnect", reconnectDevice.label, async () => {
      await runAction(
        reconnectDevice,
        (data) => {
          renderInventory(data);
          renderLatest({ selection: data.openedId ?? "authorized lookup complete" });
        },
        "authorized device lookup completed",
      );
    });
  }

  if (options.refreshInventory) {
    const refreshInventory = options.refreshInventory;
    addButton("refresh", refreshInventory.label, async () => {
      await runAction(
        refreshInventory,
        (data) => {
          renderInventory(data);
          renderLatest({ visibleCount: data.devices.length, openedId: data.openedId });
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
        renderLatest({ visibleCount: data.devices.length, openedId: data.openedId });
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
        renderLatest({ visibleCount: data.devices.length, openedId: data.openedId });
      },
      "adapter closed",
    );
  });

  updateButtons();
  rerenderSummary();

  void (async () => {
    try {
      renderEnvironment(await options.loadEnvironment());
      log("runtime info loaded");
    } catch (error) {
      renderEnvironment({ error: formatError(error) });
      log(`error: ${formatError(error)}`);
    }
  })();

  void (async () => {
    try {
      renderInventory(await options.loadInventory());
      log("inventory loaded");
    } catch (error) {
      renderInventory({ devices: [], openedId: null });
      renderLatest({ error: formatError(error) });
      log(`error: ${formatError(error)}`);
    }
  })();
}
