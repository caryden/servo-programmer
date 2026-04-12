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

interface ProbeSnapshot {
  adapterDetected: boolean;
  sessionOpen: boolean;
  servoDetected: boolean | null;
  modeLabel: string;
  profileLabel: string;
  adapterLabel: string;
  nextStep: string;
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
      --probe-bg: #0b0d10;
      --probe-bg-elevated: #12161a;
      --probe-bg-muted: #171c21;
      --probe-border: #2a2f36;
      --probe-border-strong: #404751;
      --probe-text: #f4f5f7;
      --probe-text-muted: #a7adb7;
      --probe-accent: #ec4040;
      --probe-accent-strong: #ff6565;
      --probe-success: #7adf8f;
      --probe-warn: #f2c86d;
      --probe-danger: #ff7a6e;
      --probe-shadow: 0 20px 50px rgba(0, 0, 0, 0.34);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, rgba(236, 64, 64, 0.12), transparent 18%),
        radial-gradient(circle at top right, rgba(255, 101, 101, 0.08), transparent 28%),
        linear-gradient(180deg, #101216 0%, #090b0d 100%);
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
      max-width: 1320px;
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }

    .axon-probe-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .axon-probe-brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .axon-probe-brand-mark {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      background: linear-gradient(180deg, var(--probe-accent-strong), var(--probe-accent));
      box-shadow: 0 0 0 6px rgba(236, 64, 64, 0.12);
      flex: 0 0 auto;
    }

    .axon-probe-brand-copy {
      min-width: 0;
    }

    .axon-probe-brand-name {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0;
    }

    .axon-probe-brand-tag {
      margin: 2px 0 0;
      color: var(--probe-text-muted);
      font-size: 0.82rem;
    }

    .axon-probe-top {
      display: grid;
      grid-template-columns: 1fr;
      gap: 18px;
    }

    .axon-probe-intro {
      display: grid;
      gap: 16px;
      padding: 28px;
      border: 1px solid var(--probe-border-strong);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(236, 64, 64, 0.18), rgba(236, 64, 64, 0.03) 34%),
        linear-gradient(180deg, rgba(18, 22, 26, 0.98), rgba(12, 14, 17, 0.98));
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
      font-size: 2.7rem;
      line-height: 1;
      max-width: 12ch;
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

    .axon-probe-action-panel {
      display: grid;
      gap: 14px;
    }

    .axon-probe-summary {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
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
      color: var(--probe-success);
    }

    .axon-probe-tone-warn {
      color: var(--probe-warn);
    }

    .axon-probe-tone-bad {
      color: var(--probe-danger);
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
      border-color: var(--probe-accent-strong);
      background: #1b2327;
    }

    .axon-probe-toolbar button[data-action="request"],
    .axon-probe-toolbar button[data-action="refresh"],
    .axon-probe-toolbar button[data-action="open"] {
      background: linear-gradient(180deg, rgba(236, 64, 64, 0.24), rgba(16, 23, 24, 0.94));
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
      gap: 18px;
      grid-template-columns: minmax(0, 1.7fr) minmax(300px, 360px);
    }

    .axon-probe-panel {
      padding: 18px;
      border: 1px solid var(--probe-border);
      border-radius: 8px;
      background: rgba(18, 22, 25, 0.96);
      min-width: 0;
    }

    .axon-probe-panel-primary {
      padding: 22px;
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

    .axon-probe-current {
      display: grid;
      gap: 16px;
    }

    .axon-probe-state-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .axon-probe-task-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .axon-probe-task {
      padding: 14px;
      border: 1px solid var(--probe-border);
      border-radius: 8px;
      background: rgba(9, 11, 14, 0.78);
      display: grid;
      gap: 10px;
      align-content: start;
      min-height: 168px;
    }

    .axon-probe-task-title {
      margin: 0;
      font-size: 1rem;
    }

    .axon-probe-task-body {
      margin: 0;
      color: var(--probe-text-muted);
      font-size: 0.94rem;
    }

    .axon-probe-disclosure {
      border: 1px solid var(--probe-border);
      border-radius: 8px;
      background: rgba(16, 19, 23, 0.92);
      overflow: hidden;
    }

    .axon-probe-disclosure > summary {
      list-style: none;
      cursor: pointer;
      padding: 16px 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .axon-probe-disclosure > summary::-webkit-details-marker {
      display: none;
    }

    .axon-probe-disclosure-note {
      color: var(--probe-text-muted);
      font-size: 0.86rem;
      font-weight: 400;
    }

    .axon-probe-disclosure-body {
      padding: 0 18px 18px;
    }

    .axon-probe-diagnostics-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .axon-probe-reference {
      margin: 0;
      display: grid;
      gap: 0;
      overflow: hidden;
      border: 1px solid var(--probe-border);
      border-radius: 8px;
      background: var(--probe-bg-elevated);
    }

    .axon-probe-reference-image {
      width: 100%;
      height: auto;
      object-fit: cover;
      object-position: top center;
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
      border-color: rgba(122, 223, 143, 0.45);
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
      .axon-probe-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .axon-probe-grid {
        grid-template-columns: 1fr;
      }

      .axon-probe-task-grid {
        grid-template-columns: 1fr;
      }

      .axon-probe-diagnostics-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 820px) {
      .axon-probe-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .axon-probe-title {
        font-size: 2rem;
      }

      .axon-probe-summary {
        grid-template-columns: 1fr;
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

function deriveSnapshot(
  _environment: unknown,
  inventory: ProbeInventory,
  latest: unknown,
): ProbeSnapshot {
  const adapter = inventory.devices[0];
  const adapterDetected = inventory.devices.length > 0;
  const sessionOpen = inventory.openedId !== null;
  const adapterLabel = adapter?.product ?? adapter?.manufacturer ?? "Adapter not detected";

  if (!adapterDetected) {
    return {
      adapterDetected,
      sessionOpen,
      servoDetected: null,
      modeLabel: "Awaiting probe",
      profileLabel: "Load settings to identify the servo",
      adapterLabel,
      nextStep: "Detect the adapter on the host OS, then connect to it.",
    };
  }

  if (!sessionOpen) {
    return {
      adapterDetected,
      sessionOpen,
      servoDetected: null,
      modeLabel: "Awaiting connection",
      profileLabel: "Connect before reading the servo",
      adapterLabel,
      nextStep: "Connect to the adapter, then detect the attached servo.",
    };
  }

  if (isConfigInfo(latest)) {
    return {
      adapterDetected,
      sessionOpen,
      servoDetected: true,
      modeLabel: latest.known ? "Servo settings loaded" : "Unknown profile loaded",
      profileLabel: latest.modelName ?? (latest.modelId || "Unknown model"),
      adapterLabel,
      nextStep:
        "Ready for mode changes and servo-mode tuning such as limits and PWM loss behavior.",
    };
  }

  if (isIdentifyInfo(latest)) {
    return {
      adapterDetected,
      sessionOpen,
      servoDetected: latest.present,
      modeLabel: startCase(latest.mode.replace(/_/g, " ")),
      profileLabel: latest.present
        ? "Read settings to load the current profile"
        : "No servo detected",
      adapterLabel,
      nextStep: latest.present
        ? "Load settings before changing range, neutral, or failsafe behavior."
        : "Plug in a compatible servo, then run servo detection again.",
    };
  }

  return {
    adapterDetected,
    sessionOpen,
    servoDetected: null,
    modeLabel: "Connected",
    profileLabel: "Settings not loaded yet",
    adapterLabel,
    nextStep: "Detect the attached servo, then load settings.",
  };
}

function makeSummaryItems(
  environment: unknown,
  inventory: ProbeInventory,
  latest: unknown,
): SummaryItem[] {
  const transport =
    isRecord(environment) && typeof environment.transport === "string"
      ? environment.transport
      : "Programmer";
  const snapshot = deriveSnapshot(environment, inventory, latest);

  return [
    {
      label: "Transport",
      value: transport,
      tone: "neutral",
    },
    {
      label: "Adapter",
      value: snapshot.adapterDetected ? "Detected" : "Missing",
      tone: snapshot.adapterDetected ? "good" : "warn",
    },
    {
      label: "Session",
      value: snapshot.sessionOpen ? "Connected" : "Idle",
      tone: snapshot.sessionOpen ? "good" : "neutral",
    },
    {
      label: "Servo",
      value:
        snapshot.servoDetected === null
          ? "Not Checked"
          : snapshot.servoDetected
            ? "Detected"
            : "Not Found",
      tone: snapshot.servoDetected === null ? "neutral" : snapshot.servoDetected ? "good" : "warn",
    },
    {
      label: "Profile",
      value: snapshot.profileLabel,
      tone: isConfigInfo(latest) && latest.known ? "good" : "neutral",
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

function renderCurrentPanel(
  document: Document,
  container: HTMLElement,
  environment: unknown,
  inventory: ProbeInventory,
  latest: unknown,
) {
  clear(container);

  const snapshot = deriveSnapshot(environment, inventory, latest);
  const chips = createElement(document, "div", "axon-probe-state-row");
  chips.append(
    createChip(
      document,
      snapshot.adapterDetected ? "Adapter detected" : "Adapter missing",
      snapshot.adapterDetected ? "good" : "warn",
    ),
    createChip(
      document,
      snapshot.sessionOpen ? "Connection open" : "Connection idle",
      snapshot.sessionOpen ? "good" : "neutral",
    ),
    createChip(
      document,
      snapshot.servoDetected === null
        ? "Servo not checked"
        : snapshot.servoDetected
          ? "Servo detected"
          : "No servo detected",
      snapshot.servoDetected === null ? "neutral" : snapshot.servoDetected ? "good" : "warn",
    ),
  );

  const docsValue =
    isConfigInfo(latest) && latest.docsUrl
      ? (() => {
          const link = createElement(document, "a");
          link.href = latest.docsUrl;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = latest.docsUrl;
          return link;
        })()
      : "—";

  const rows: ReadonlyArray<readonly [string, string | Node]> = [
    ["Adapter", snapshot.adapterLabel],
    ["Current Mode", snapshot.modeLabel],
    ["Detected Servo", snapshot.profileLabel],
    ["Docs", docsValue],
    ["Next Step", snapshot.nextStep],
  ];

  const content = createElement(document, "div", "axon-probe-current");
  content.append(chips, createKeyValueList(document, rows));
  container.append(content);
}

function renderTaskPanel(document: Document, container: HTMLElement) {
  clear(container);

  const cards = [
    {
      title: "Switch Mode",
      body: "The common path is switching between Servo Mode and Continuous Rotation Mode. Start by loading the current servo so the UI can present the right mode target clearly.",
    },
    {
      title: "Tune Range",
      body: "In Servo Mode, the key work is left and right travel plus neutral position. Those settings should be surfaced as the primary controls, not buried in diagnostics.",
    },
    {
      title: "Handle Signal Loss",
      body: "Kids need to choose what happens when PWM disappears: release, hold, or neutral. That belongs near the top-level setup flow with plain language and visible consequences.",
    },
  ] as const;

  const grid = createElement(document, "div", "axon-probe-task-grid");
  for (const card of cards) {
    const item = createElement(document, "article", "axon-probe-task");
    const title = createElement(document, "h3", "axon-probe-task-title");
    const body = createElement(document, "p", "axon-probe-task-body");
    const chipRow = createElement(document, "div", "axon-probe-chip-row");
    title.textContent = card.title;
    body.textContent = card.body;
    chipRow.append(createChip(document, "Primary workflow", "good"));
    item.append(title, body, chipRow);
    grid.append(item);
  }

  container.append(grid);
}

function renderConnectionPanel(
  document: Document,
  container: HTMLElement,
  inventory: ProbeInventory,
) {
  clear(container);

  if (inventory.devices.length === 0) {
    const empty = createElement(document, "p", "axon-probe-empty");
    empty.textContent =
      "No adapter is visible yet. Keep the device on the host OS, then run the detect or scan action.";
    container.append(empty);
    return;
  }

  const primary = inventory.devices[0];
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["Adapter", primary.product ?? "Axon Adapter"],
    ["Vendor / Product", `${primary.vendorId ?? "VID?"} / ${primary.productId ?? "PID?"}`],
    ["Interface", formatValue(primary.interface)],
    ["Status", primary.opened ? "Connected" : "Detected"],
    ["Path", primary.id ?? "—"],
  ];

  container.append(createKeyValueList(document, rows));
  if (inventory.devices.length > 1) {
    const note = createElement(document, "p", "axon-probe-empty");
    note.textContent = `${inventory.devices.length} adapters are visible. The first one is the active target.`;
    container.append(note);
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
        <details class="axon-probe-disclosure">
          <summary>
            <span>Axon MK2 Reference</span>
            <span class="axon-probe-disclosure-note">Branding and interaction baseline</span>
          </summary>
          <div class="axon-probe-disclosure-body">
            <figure class="axon-probe-reference">
              <img class="axon-probe-reference-image" src="${options.referenceImage.src}" alt="${options.referenceImage.alt}" />
              <figcaption class="axon-probe-reference-caption">${options.referenceImage.caption}</figcaption>
            </figure>
          </div>
        </details>
      `
    : "";

  options.root.innerHTML = `
    <main class="axon-probe-app">
      <div class="axon-probe-shell">
        <header class="axon-probe-header">
          <div class="axon-probe-brand">
            <span class="axon-probe-brand-mark" aria-hidden="true"></span>
            <div class="axon-probe-brand-copy">
              <p class="axon-probe-brand-name">Axon Robotics</p>
              <p class="axon-probe-brand-tag">Servo programmer workspace</p>
            </div>
          </div>
        </header>

        <section class="axon-probe-top">
          <section class="axon-probe-intro axon-probe-panel-primary">
            ${options.eyebrow ? `<p class="axon-probe-eyebrow">${options.eyebrow}</p>` : ""}
            <h1 class="axon-probe-title">${options.title}</h1>
            <p class="axon-probe-description">${options.description}</p>
            <ul class="axon-probe-bullets">${options.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}</ul>
            <div class="axon-probe-summary" data-role="summary"></div>
          </section>
        </section>

        <section class="axon-probe-panel axon-probe-action-panel">
          <div class="axon-probe-panel-header">
            <h2 class="axon-probe-panel-title">Primary Actions</h2>
            <span class="axon-probe-panel-note">Detect hardware first, then load the current servo.</span>
          </div>
          <section class="axon-probe-toolbar" data-role="actions"></section>
        </section>

        <section class="axon-probe-grid">
          <section class="axon-probe-panel axon-probe-panel-primary">
            <div class="axon-probe-panel-header">
              <h2 class="axon-probe-panel-title">Current Setup</h2>
              <span class="axon-probe-panel-note">Connection state and the next likely action.</span>
            </div>
            <div data-role="current"></div>

            <div class="axon-probe-subsection">
              <p class="axon-probe-subsection-label">Common Tasks</p>
              <div data-role="tasks"></div>
            </div>
          </section>

          <div class="axon-probe-stack">
            <section class="axon-probe-panel">
              <div class="axon-probe-panel-header">
                <h2 class="axon-probe-panel-title">Connection</h2>
                <span class="axon-probe-panel-note">Clear hardware status before any settings work.</span>
              </div>
              <div data-role="connection"></div>
            </section>

            ${imageMarkup}
          </div>
        </section>

        <details class="axon-probe-disclosure">
          <summary>
            <span>Diagnostics</span>
            <span class="axon-probe-disclosure-note">Environment, protocol details, and the session log.</span>
          </summary>
          <div class="axon-probe-disclosure-body">
            <div class="axon-probe-diagnostics-grid">
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

              <section class="axon-probe-panel">
                <div class="axon-probe-panel-header">
                  <h2 class="axon-probe-panel-title">Protocol Details</h2>
                  <span class="axon-probe-panel-note">Latest parsed reply plus raw bytes</span>
                </div>
                <div data-role="latest"></div>
              </section>

              <section class="axon-probe-panel">
                <div class="axon-probe-panel-header">
                  <h2 class="axon-probe-panel-title">Session Log</h2>
                  <span class="axon-probe-panel-note">Shown on demand instead of on first glance.</span>
                </div>
                <pre class="axon-probe-pre axon-probe-log" data-role="log"></pre>
              </section>
            </div>
          </div>
        </details>
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
  const currentEl = requireElement<HTMLElement>(
    options.root,
    '[data-role="current"]',
    "Axon probe UI failed to initialize the current region.",
  );
  const tasksEl = requireElement<HTMLElement>(
    options.root,
    '[data-role="tasks"]',
    "Axon probe UI failed to initialize the tasks region.",
  );
  const connectionEl = requireElement<HTMLElement>(
    options.root,
    '[data-role="connection"]',
    "Axon probe UI failed to initialize the connection region.",
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
    renderConnectionPanel(document, connectionEl, inventoryState);
    updateButtons();
    rerenderSummary();
    renderCurrentPanel(document, currentEl, environmentState, inventoryState, latestState);
  }

  function renderEnvironment(next: unknown) {
    environmentState = next;
    renderEnvironmentPanel(document, environmentEl, environmentState);
    rerenderSummary();
    renderCurrentPanel(document, currentEl, environmentState, inventoryState, latestState);
  }

  function renderLatest(value: unknown) {
    latestState = value;
    renderLatestPanel(document, latestEl, latestState);
    rerenderSummary();
    renderCurrentPanel(document, currentEl, environmentState, inventoryState, latestState);
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
  renderTaskPanel(document, tasksEl);
  renderConnectionPanel(document, connectionEl, inventoryState);
  renderCurrentPanel(document, currentEl, environmentState, inventoryState, latestState);

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
