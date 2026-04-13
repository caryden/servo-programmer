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
  opened: boolean;
  collections?: ProbeCollectionInfo[];
}

export interface ProbeCollectionInfo {
  usagePage: string | null;
  usage: string | null;
  inputReports: number[];
  outputReports: number[];
  featureReports: number[];
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
  mode: "servo_mode" | "cr_mode" | "unknown";
  rawRx: string;
}

export interface ProbeSetupInfo {
  rangeDegrees: number | null;
  rangePercent: number | null;
  neutralUs: number | null;
  neutralPercent: number | null;
  pwmLossBehavior: string | null;
  inversion: string | null;
  softStart: boolean | null;
  sensitivityLabel: string | null;
  pwmPowerPercent: number | null;
}

export interface ProbeConfigInfo {
  length: number;
  modelId: string;
  known: boolean;
  modelName: string | null;
  docsUrl: string | null;
  mode: "servo_mode" | "cr_mode" | "unknown";
  modeLabel: string;
  setup: ProbeSetupInfo | null;
  rawHex: string;
  firstChunk: string;
  secondChunk: string;
}

interface ProbeAction<T> {
  label: string;
  run: () => Promise<T>;
}

export interface MountProbeAppOptions {
  root: HTMLElement;
  eyebrow?: string;
  title: string;
  description?: string;
  bullets?: string[];
  devicePanelTitle?: string;
  emptyDeviceText?: string;
  loadEnvironment: () => Promise<unknown>;
  loadInventory: () => Promise<ProbeInventory>;
  requestDevice?: ProbeAction<ProbeInventory>;
  reconnectDevice?: ProbeAction<ProbeInventory>;
  refreshInventory?: ProbeAction<ProbeInventory>;
  openDevice?: ProbeAction<ProbeInventory>;
  closeDevice?: ProbeAction<ProbeInventory>;
  identifyServo?: ProbeAction<ProbeIdentifyInfo>;
  readFullConfig?: ProbeAction<ProbeConfigInfo>;
}

interface LogEntry {
  timestamp: string;
  message: string;
}

interface ProbeState {
  environment: unknown | null;
  inventory: ProbeInventory;
  identify: ProbeIdentifyInfo | null;
  config: ProbeConfigInfo | null;
  busyAction: string | null;
  error: string | null;
  logs: LogEntry[];
  diagnosticsOpen: boolean;
  selectedProfileId: string;
}

interface ProfilePreview {
  id: string;
  name: string;
  mode: string;
  summary: string;
}

const PROFILE_PREVIEWS: ProfilePreview[] = [
  {
    id: "claw",
    name: "Claw",
    mode: "Servo",
    summary: "Hold a target and keep the center easy to tune.",
  },
  {
    id: "intake",
    name: "Intake",
    mode: "Continuous",
    summary: "Start from a wheel-style setup that spins smoothly.",
  },
  {
    id: "gate",
    name: "Gate",
    mode: "Servo",
    summary: "Open and close with a tighter range and calm neutral.",
  },
  {
    id: "arm",
    name: "Arm Joint",
    mode: "Servo",
    summary: "Bias for controlled center and safer signal loss behavior.",
  },
];

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSignedUs(value: number | null): string {
  if (value === null) return "Center unknown";
  if (value === 0) return "Centered";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} us`;
}

function formatRange(value: number | null): string {
  if (value === null) return "--";
  return `${value}&deg;`;
}

function formatLoss(value: string | null): string {
  if (value === "release") return "Let go";
  if (value === "hold") return "Hold";
  if (value === "neutral") return "Go to center";
  return "Unknown";
}

function formatInversion(value: string | null): string {
  if (value === "reversed") return "Reversed";
  if (value === "normal") return "Normal";
  return "Unknown";
}

function modeDisplay(mode: ProbeIdentifyInfo["mode"] | ProbeConfigInfo["mode"] | null): string {
  if (mode === "servo_mode") return "Servo";
  if (mode === "cr_mode") return "Continuous Rotation";
  return "Unknown";
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function railGeometry(config: ProbeConfigInfo | null): {
  start: number;
  width: number;
  pointer: number;
} {
  const rangePercent = clamp(config?.setup?.rangePercent ?? 50, 8, 100);
  const neutralPercent = clamp(config?.setup?.neutralPercent ?? 50, 0, 100);
  const start = clamp(neutralPercent - rangePercent / 2, 0, 100);
  const end = clamp(neutralPercent + rangePercent / 2, 0, 100);
  return {
    start,
    width: Math.max(6, end - start),
    pointer: neutralPercent,
  };
}

function currentMode(
  state: ProbeState,
): ProbeIdentifyInfo["mode"] | ProbeConfigInfo["mode"] | null {
  return state.config?.mode ?? state.identify?.mode ?? null;
}

function adapterDescriptor(inventory: ProbeInventory): ProbeDeviceInfo | null {
  return (
    inventory.devices.find((device) => device.id === inventory.openedId) ??
    inventory.devices[0] ??
    null
  );
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function mountProbeApp(options: MountProbeAppOptions): void {
  const state: ProbeState = {
    environment: null,
    inventory: { devices: [], openedId: null },
    identify: null,
    config: null,
    busyAction: null,
    error: null,
    logs: [],
    diagnosticsOpen: false,
    selectedProfileId: "claw",
  };

  function log(message: string): void {
    state.logs.unshift({ timestamp: nowLabel(), message });
    state.logs = state.logs.slice(0, 14);
  }

  function updateInventory(inventory: ProbeInventory): void {
    state.inventory = inventory;
    if (!inventory.openedId) {
      state.identify = null;
      state.config = null;
    }
  }

  function setProfileSuggestion(): void {
    const mode = currentMode(state);
    if (mode === "cr_mode") {
      state.selectedProfileId = "intake";
      return;
    }
    if (mode === "servo_mode") {
      state.selectedProfileId = "claw";
    }
  }

  const runAction = async <T>(
    actionName: string,
    task: () => Promise<T>,
    onSuccess: (result: T) => void,
  ): Promise<void> => {
    if (state.busyAction) return;
    state.busyAction = actionName;
    state.error = null;
    render();
    try {
      const result = await task();
      onSuccess(result);
      log(`${actionName} done`);
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      log(`${actionName} failed`);
    } finally {
      state.busyAction = null;
      render();
    }
  };

  function renderActionButton(
    actionId: string,
    spec: ProbeAction<unknown> | undefined,
    disabled: boolean,
    tone: "primary" | "neutral" | "quiet",
    caption: string,
  ): string {
    if (!spec) return "";
    return `
      <button class="action-button action-${tone}" data-action="${escapeHtml(actionId)}" ${disabled ? "disabled" : ""}>
        <span class="action-label">${escapeHtml(spec.label)}</span>
        <span class="action-caption">${escapeHtml(caption)}</span>
      </button>
    `;
  }

  function render(): void {
    const connected = Boolean(state.inventory.openedId);
    const visible = state.inventory.devices.length > 0;
    const servoPresent = state.identify?.present ?? Boolean(state.config);
    const modelName = state.config?.modelName ?? null;
    const modelId = state.config?.modelId ?? null;
    const mode = currentMode(state);
    const setup = state.config?.setup ?? null;
    const descriptor = adapterDescriptor(state.inventory);
    const rail = railGeometry(state.config);

    const adapterTone = connected ? "ok" : visible ? "warn" : "idle";
    const servoTone = servoPresent ? "ok" : connected ? "warn" : "idle";
    const modeTone = mode && mode !== "unknown" ? "ok" : "idle";
    const setupTone = setup ? "ok" : connected ? "warn" : "idle";

    const selectedProfile =
      PROFILE_PREVIEWS.find((profile) => profile.id === state.selectedProfileId) ??
      PROFILE_PREVIEWS[0];

    const diagnostics = {
      environment: state.environment,
      inventory: state.inventory,
      identify: state.identify,
      config: state.config
        ? {
            modelId: state.config.modelId,
            mode: state.config.modeLabel,
            rawHex: state.config.rawHex,
            firstChunk: state.config.firstChunk,
            secondChunk: state.config.secondChunk,
          }
        : null,
      logs: state.logs,
    };

    options.root.innerHTML = `
      <style>
        :root {
          color-scheme: light;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
        }

        .probe-shell {
          min-height: 100vh;
          padding: 20px 20px 28px;
          background:
            linear-gradient(180deg, #fcfcfc 0%, #f4f5f7 100%);
          color: #171717;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .shell-inner {
          max-width: 1260px;
          margin: 0 auto;
        }

        .topbar {
          display: grid;
          gap: 16px;
          align-items: end;
          margin-bottom: 16px;
        }

        .brand-row {
          display: flex;
          gap: 14px;
          align-items: center;
        }

        .brand-mark {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          background: #e40014;
          box-shadow: 12px 0 0 #171717;
        }

        .brand-copy {
          min-width: 0;
        }

        .eyebrow {
          margin: 0 0 4px;
          color: #5f6773;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .app-title {
          margin: 0;
          font-size: 32px;
          line-height: 1.05;
          font-weight: 700;
        }

        .app-subtitle {
          margin: 6px 0 0;
          color: #4b5563;
          font-size: 15px;
          line-height: 1.5;
          max-width: 780px;
        }

        .status-ribbon {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .status-chip {
          display: grid;
          gap: 4px;
          padding: 12px 14px;
          border: 1px solid #d7dae0;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.86);
          min-height: 74px;
        }

        .status-chip strong {
          font-size: 16px;
          line-height: 1.2;
        }

        .status-label {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          color: #5f6773;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #bcc3cf;
        }

        .status-ok .status-dot {
          background: #00a544;
        }

        .status-warn .status-dot {
          background: #f99c00;
        }

        .action-row {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }

        .action-button {
          display: grid;
          gap: 4px;
          min-height: 74px;
          padding: 14px 16px;
          text-align: left;
          border-radius: 8px;
          border: 1px solid #cfd4dc;
          background: #fff;
          color: #171717;
          cursor: pointer;
          transition:
            transform 120ms ease,
            border-color 120ms ease,
            box-shadow 120ms ease;
        }

        .action-button:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: #aeb4bf;
          box-shadow: 0 10px 22px rgba(23, 23, 23, 0.08);
        }

        .action-button:disabled {
          cursor: default;
          color: #9aa1ac;
          background: #f3f4f6;
        }

        .action-primary {
          border-color: #171717;
        }

        .action-quiet {
          background: transparent;
        }

        .action-label {
          font-size: 17px;
          font-weight: 650;
          line-height: 1.2;
        }

        .action-caption {
          color: #5f6773;
          font-size: 12px;
          line-height: 1.35;
        }

        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.95fr);
          gap: 18px;
        }

        .panel {
          border: 1px solid #d7dae0;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.92);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: end;
          padding: 18px 18px 0;
        }

        .panel-title {
          margin: 0;
          font-size: 24px;
          line-height: 1.1;
          font-weight: 700;
        }

        .panel-kicker {
          margin: 0 0 4px;
          color: #5f6773;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .panel-body {
          padding: 18px;
        }

        .metric-row {
          display: flex;
          gap: 20px;
          align-items: baseline;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .metric {
          display: grid;
          gap: 2px;
        }

        .metric-label {
          color: #5f6773;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .metric-value {
          font-size: 28px;
          line-height: 1;
          font-weight: 700;
        }

        .motion-rail {
          position: relative;
          height: 110px;
          margin-bottom: 14px;
        }

        .motion-track,
        .motion-track-center,
        .motion-track-fill,
        .motion-track-pointer {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
        }

        .motion-track {
          left: 0;
          right: 0;
          height: 16px;
          border-radius: 999px;
          background:
            linear-gradient(90deg, #eceef2 0%, #f6f7f9 100%);
          border: 1px solid #dce0e6;
        }

        .motion-track-center {
          left: 50%;
          width: 2px;
          height: 48px;
          background: #171717;
        }

        .motion-track-fill {
          height: 16px;
          border-radius: 999px;
          background: linear-gradient(90deg, #fdb7bc 0%, #e40014 100%);
        }

        .motion-track-pointer {
          width: 18px;
          height: 18px;
          margin-left: -9px;
          border-radius: 999px;
          background: #171717;
          box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.92);
        }

        .motion-legend {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #69707d;
          font-size: 13px;
        }

        .helper-copy {
          margin: 16px 0 0;
          color: #505866;
          font-size: 14px;
          line-height: 1.5;
        }

        .right-stack {
          display: grid;
          gap: 18px;
        }

        .mode-strip,
        .loss-strip {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 14px;
        }

        .loss-strip {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin-top: 12px;
        }

        .choice {
          padding: 14px 12px;
          border: 1px solid #d6dbe3;
          border-radius: 8px;
          background: #f7f8fa;
        }

        .choice strong {
          display: block;
          font-size: 16px;
          line-height: 1.2;
        }

        .choice span {
          display: block;
          margin-top: 4px;
          color: #5f6773;
          font-size: 12px;
          line-height: 1.35;
        }

        .choice-active {
          border-color: #171717;
          background: #fff;
          box-shadow: inset 0 0 0 1px #171717;
        }

        .trait-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 16px;
        }

        .trait {
          padding: 10px 0 0;
          border-top: 1px solid #e3e6eb;
        }

        .trait strong {
          display: block;
          font-size: 15px;
          line-height: 1.2;
        }

        .trait span {
          display: block;
          margin-top: 4px;
          color: #5f6773;
          font-size: 12px;
          line-height: 1.4;
        }

        .status-list {
          display: grid;
          gap: 12px;
        }

        .status-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #eceef2;
        }

        .status-row:last-child {
          padding-bottom: 0;
          border-bottom: 0;
        }

        .status-row strong {
          font-size: 15px;
          line-height: 1.25;
        }

        .status-row span {
          color: #5f6773;
          font-size: 13px;
          line-height: 1.4;
          text-align: right;
        }

        .profiles-panel {
          margin-top: 18px;
        }

        .profiles-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .profile-tile {
          border-radius: 8px;
          border: 1px solid #d6dbe3;
          background: #fff;
          padding: 14px;
          text-align: left;
          cursor: pointer;
        }

        .profile-tile:hover {
          border-color: #aeb4bf;
        }

        .profile-tile[data-selected="true"] {
          border-color: #171717;
          box-shadow: inset 0 0 0 1px #171717;
        }

        .profile-mode {
          display: inline-block;
          margin-bottom: 10px;
          padding: 4px 7px;
          border-radius: 999px;
          background: #f3f4f6;
          color: #5f6773;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .profile-name {
          margin: 0;
          font-size: 17px;
          line-height: 1.2;
          font-weight: 700;
        }

        .profile-summary {
          margin: 8px 0 0;
          color: #535b68;
          font-size: 13px;
          line-height: 1.45;
        }

        .profiles-note {
          margin: 14px 0 0;
          color: #5f6773;
          font-size: 13px;
          line-height: 1.45;
        }

        .error-banner {
          margin: 0 0 16px;
          padding: 12px 14px;
          border: 1px solid #f3b5bc;
          border-radius: 8px;
          background: #fff3f4;
          color: #8a101d;
          font-size: 14px;
          line-height: 1.45;
        }

        details.diagnostics {
          margin-top: 18px;
          border: 1px solid #d7dae0;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.9);
          overflow: hidden;
        }

        .diagnostics summary {
          cursor: pointer;
          padding: 14px 18px;
          font-weight: 650;
          list-style: none;
        }

        .diagnostics summary::-webkit-details-marker {
          display: none;
        }

        .diagnostics-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          padding: 0 18px 18px;
        }

        .diag-block {
          min-height: 160px;
          border: 1px solid #e1e5eb;
          border-radius: 8px;
          background: #f7f8fa;
          padding: 12px;
        }

        .diag-block h3 {
          margin: 0 0 10px;
          font-size: 13px;
          text-transform: uppercase;
          color: #5f6773;
        }

        .diag-block pre {
          margin: 0;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 12px;
          line-height: 1.45;
          color: #1f2937;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }

        @media (max-width: 1080px) {
          .status-ribbon,
          .action-row,
          .profiles-grid,
          .trait-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .main-grid,
          .diagnostics-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .probe-shell {
            padding: 16px 14px 24px;
          }

          .status-ribbon,
          .action-row,
          .mode-strip,
          .loss-strip,
          .profiles-grid,
          .trait-row {
            grid-template-columns: 1fr;
          }

          .app-title {
            font-size: 28px;
          }

          .panel-title {
            font-size: 21px;
          }

          .metric-value {
            font-size: 24px;
          }
        }
      </style>
      <div class="probe-shell">
        <div class="shell-inner">
          <div class="topbar">
            <div class="brand-row">
              <div class="brand-mark" aria-hidden="true"></div>
              <div class="brand-copy">
                ${options.eyebrow ? `<p class="eyebrow">${escapeHtml(options.eyebrow)}</p>` : ""}
                <h1 class="app-title">${escapeHtml(options.title)}</h1>
                <p class="app-subtitle">See the adapter, identify the servo, then work from mode, center, range, and safe behavior.</p>
              </div>
            </div>
            <div class="status-ribbon">
              <div class="status-chip status-${adapterTone}">
                <div class="status-label"><span class="status-dot"></span> Adapter</div>
                <strong>${connected ? "Connected" : visible ? "Found on USB" : "Not detected"}</strong>
                <span>${escapeHtml(descriptor?.product ?? "Connect the Axon adapter on the host machine.")}</span>
              </div>
              <div class="status-chip status-${servoTone}">
                <div class="status-label"><span class="status-dot"></span> Servo</div>
                <strong>${servoPresent ? "Servo detected" : connected ? "Not found yet" : "Waiting for adapter"}</strong>
                <span>${servoPresent ? escapeHtml(modelName ?? "Attached servo") : "Use Find Servo after the adapter is connected."}</span>
              </div>
              <div class="status-chip status-${modeTone}">
                <div class="status-label"><span class="status-dot"></span> Mode</div>
                <strong>${escapeHtml(modeDisplay(mode))}</strong>
                <span>${mode === "cr_mode" ? "Use this when you want wheel behavior." : mode === "servo_mode" ? "Use this when you want position control." : "Show current setup to reveal the active mode."}</span>
              </div>
              <div class="status-chip status-${setupTone}">
                <div class="status-label"><span class="status-dot"></span> Setup</div>
                <strong>${setup ? "Current setup loaded" : "No setup loaded yet"}</strong>
                <span>${setup ? `${escapeHtml(selectedProfile.name)} is the closest starting point.` : "Load the current setup before changing range or center."}</span>
              </div>
            </div>
          </div>

          ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ""}

          <div class="action-row">
            ${renderActionButton(
              "requestDevice",
              options.requestDevice ?? options.refreshInventory,
              Boolean(state.busyAction),
              "primary",
              "See the Axon adapter on USB.",
            )}
            ${renderActionButton(
              "reconnectDevice",
              options.reconnectDevice,
              Boolean(state.busyAction),
              "quiet",
              "Reuse a browser-approved adapter.",
            )}
            ${renderActionButton(
              "openDevice",
              options.openDevice,
              Boolean(state.busyAction) || !visible || connected,
              "neutral",
              "Claim the adapter for this app.",
            )}
            ${renderActionButton(
              "identifyServo",
              options.identifyServo,
              Boolean(state.busyAction) || !connected,
              "neutral",
              "Check what servo is attached right now.",
            )}
            ${renderActionButton(
              "readFullConfig",
              options.readFullConfig,
              Boolean(state.busyAction) || !connected,
              "primary",
              "Show mode, center, range, and safety settings.",
            )}
            ${renderActionButton(
              "closeDevice",
              options.closeDevice,
              Boolean(state.busyAction) || !connected,
              "quiet",
              "Release the adapter for other tools.",
            )}
          </div>

          <div class="main-grid">
            <section class="panel">
              <div class="panel-header">
                <div>
                  <p class="panel-kicker">Motion</p>
                  <h2 class="panel-title">${escapeHtml(modelName ?? "Current servo setup")}</h2>
                </div>
                <div class="metric-row">
                  <div class="metric">
                    <span class="metric-label">Range</span>
                    <span class="metric-value">${formatRange(setup?.rangeDegrees ?? null)}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Center</span>
                    <span class="metric-value">${escapeHtml(formatSignedUs(setup?.neutralUs ?? null))}</span>
                  </div>
                </div>
              </div>
              <div class="panel-body">
                <div class="motion-rail" aria-hidden="true">
                  <div class="motion-track"></div>
                  <div class="motion-track-fill" style="left:${rail.start}%; width:${rail.width}%;"></div>
                  <div class="motion-track-center"></div>
                  <div class="motion-track-pointer" style="left:${rail.pointer}%;"></div>
                </div>
                <div class="motion-legend">
                  <span>Smaller sweep</span>
                  <span>Neutral stays centered unless trimmed</span>
                  <span>Wider sweep</span>
                </div>
                <p class="helper-copy">
                  ${
                    setup
                      ? `This visual shows how much of the servo's travel is active and whether the center is trimmed away from neutral.`
                      : `Connect the adapter and show the current setup to see the sweep and center visually instead of reading raw config bytes.`
                  }
                </p>
              </div>
            </section>

            <div class="right-stack">
              <section class="panel">
                <div class="panel-header">
                  <div>
                    <p class="panel-kicker">Mode and safety</p>
                    <h2 class="panel-title">How this servo behaves</h2>
                  </div>
                </div>
                <div class="panel-body">
                  <div class="mode-strip">
                    <div class="choice ${mode === "servo_mode" ? "choice-active" : ""}">
                      <strong>Servo</strong>
                      <span>Position the horn to a target angle.</span>
                    </div>
                    <div class="choice ${mode === "cr_mode" ? "choice-active" : ""}">
                      <strong>Continuous Rotation</strong>
                      <span>Spin like a wheel instead of holding an angle.</span>
                    </div>
                  </div>

                  <div class="loss-strip">
                    <div class="choice ${setup?.pwmLossBehavior === "release" ? "choice-active" : ""}">
                      <strong>Let go</strong>
                      <span>Stop driving when signal disappears.</span>
                    </div>
                    <div class="choice ${setup?.pwmLossBehavior === "hold" ? "choice-active" : ""}">
                      <strong>Hold</strong>
                      <span>Keep trying to stay where it was.</span>
                    </div>
                    <div class="choice ${setup?.pwmLossBehavior === "neutral" ? "choice-active" : ""}">
                      <strong>Go to center</strong>
                      <span>Return to the saved neutral point.</span>
                    </div>
                  </div>

                  <div class="trait-row">
                    <div class="trait">
                      <strong>${escapeHtml(formatInversion(setup?.inversion ?? null))}</strong>
                      <span>Direction</span>
                    </div>
                    <div class="trait">
                      <strong>${setup?.softStart == null ? "Unknown" : setup.softStart ? "Enabled" : "Off"}</strong>
                      <span>Soft start</span>
                    </div>
                    <div class="trait">
                      <strong>${escapeHtml(setup?.sensitivityLabel ?? "Unknown")}</strong>
                      <span>Feel</span>
                    </div>
                  </div>
                </div>
              </section>

              <section class="panel">
                <div class="panel-header">
                  <div>
                    <p class="panel-kicker">Connection</p>
                    <h2 class="panel-title">What is attached right now</h2>
                  </div>
                </div>
                <div class="panel-body">
                  <div class="status-list">
                    <div class="status-row">
                      <strong>Adapter</strong>
                      <span>${escapeHtml(descriptor?.product ?? "No adapter yet")}</span>
                    </div>
                    <div class="status-row">
                      <strong>USB path</strong>
                      <span>${escapeHtml(descriptor?.id ?? "Waiting for detection")}</span>
                    </div>
                    <div class="status-row">
                      <strong>Servo</strong>
                      <span>${servoPresent ? escapeHtml(modelName ?? "Detected") : "Not detected"}</span>
                    </div>
                    <div class="status-row">
                      <strong>Model ID</strong>
                      <span>${escapeHtml(modelId ?? "--")}</span>
                    </div>
                    <div class="status-row">
                      <strong>Signal loss</strong>
                      <span>${escapeHtml(formatLoss(setup?.pwmLossBehavior ?? null))}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <section class="panel profiles-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Starting points</p>
                <h2 class="panel-title">FTC job-based profiles</h2>
              </div>
            </div>
            <div class="panel-body">
              <div class="profiles-grid">
                ${PROFILE_PREVIEWS.map(
                  (profile) => `
                    <button
                      class="profile-tile"
                      data-profile-id="${escapeHtml(profile.id)}"
                      data-selected="${profile.id === state.selectedProfileId}"
                    >
                      <span class="profile-mode">${escapeHtml(profile.mode)}</span>
                      <p class="profile-name">${escapeHtml(profile.name)}</p>
                      <p class="profile-summary">${escapeHtml(profile.summary)}</p>
                    </button>
                  `,
                ).join("")}
              </div>
              <p class="profiles-note">
                Start from the job the team actually wants to do. The selected profile is a planning cue for the next pass, not a firmware write yet.
              </p>
            </div>
          </section>

          <details class="diagnostics" ${state.diagnosticsOpen ? "open" : ""}>
            <summary>Diagnostics and raw replies</summary>
            <div class="diagnostics-grid">
              <section class="diag-block">
                <h3>Runtime</h3>
                <pre>${escapeHtml(toPrettyJson(diagnostics.environment ?? {}))}</pre>
              </section>
              <section class="diag-block">
                <h3>USB inventory</h3>
                <pre>${escapeHtml(toPrettyJson(diagnostics.inventory))}</pre>
              </section>
              <section class="diag-block">
                <h3>Servo replies</h3>
                <pre>${escapeHtml(toPrettyJson(diagnostics.identify ?? diagnostics.config ?? {}))}</pre>
              </section>
              <section class="diag-block">
                <h3>Session log</h3>
                <pre>${escapeHtml(
                  state.logs.map((entry) => `[${entry.timestamp}] ${entry.message}`).join("\n") ||
                    "No activity yet.",
                )}</pre>
              </section>
            </div>
          </details>
        </div>
      </div>
    `;

    options.root.querySelectorAll<HTMLButtonElement>("[data-profile-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedProfileId = button.dataset.profileId ?? state.selectedProfileId;
        render();
      });
    });

    const details = options.root.querySelector<HTMLDetailsElement>("details.diagnostics");
    if (details) {
      details.addEventListener("toggle", () => {
        state.diagnosticsOpen = details.open;
      });
    }

    const requestOrRefresh = options.requestDevice ?? options.refreshInventory;
    const reconnectAction = options.reconnectDevice;
    const openAction = options.openDevice;
    const closeAction = options.closeDevice;
    const identifyAction = options.identifyServo;
    const readAction = options.readFullConfig;

    const actionMap: Record<string, (() => Promise<void>) | undefined> = {
      requestDevice: requestOrRefresh
        ? () =>
            runAction(requestOrRefresh.label, requestOrRefresh.run, (result) => {
              updateInventory(result);
            })
        : undefined,
      reconnectDevice: reconnectAction
        ? () =>
            runAction(reconnectAction.label, reconnectAction.run, (result) => {
              updateInventory(result);
            })
        : undefined,
      openDevice: openAction
        ? () =>
            runAction(openAction.label, openAction.run, (result) => {
              updateInventory(result);
            })
        : undefined,
      closeDevice: closeAction
        ? () =>
            runAction(closeAction.label, closeAction.run, (result) => {
              updateInventory(result);
            })
        : undefined,
      identifyServo: identifyAction
        ? () =>
            runAction(identifyAction.label, identifyAction.run, (result) => {
              state.identify = result;
              if (!result.present) {
                state.config = null;
              }
            })
        : undefined,
      readFullConfig: readAction
        ? () =>
            runAction(readAction.label, readAction.run, (result) => {
              state.config = result;
              setProfileSuggestion();
            })
        : undefined,
    };

    options.root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
      const actionId = button.dataset.action ?? "";
      const handler = actionMap[actionId];
      if (!handler || button.disabled) return;
      button.addEventListener("click", () => {
        void handler();
      });
    });
  }

  async function bootstrap(): Promise<void> {
    log("Loading environment");
    render();
    try {
      const [environment, inventory] = await Promise.all([
        options.loadEnvironment(),
        options.loadInventory(),
      ]);
      state.environment = environment;
      updateInventory(inventory);
      log("Ready");
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      log("Startup failed");
    }
    render();
  }

  void bootstrap();
}
