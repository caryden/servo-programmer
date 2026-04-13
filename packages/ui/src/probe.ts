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

interface ProfilePreset {
  id: string;
  label: string;
  mode: "servo_mode" | "cr_mode";
  rangePercent: number;
  neutralUs: number;
  reversed: boolean;
  pwmLossBehavior: "release" | "hold" | "neutral";
  softStart: boolean;
  pwmUs: number;
}

interface DraftSetup {
  profileId: string;
  mode: "servo_mode" | "cr_mode";
  rangePercent: number;
  neutralUs: number;
  reversed: boolean;
  pwmLossBehavior: "release" | "hold" | "neutral";
  softStart: boolean;
  pwmUs: number;
  voltage: number;
  loadPercent: number;
}

interface ProbeState {
  environment: unknown | null;
  inventory: ProbeInventory;
  identify: ProbeIdentifyInfo | null;
  config: ProbeConfigInfo | null;
  draft: DraftSetup;
  busyAction: string | null;
  error: string | null;
  logs: LogEntry[];
  diagnosticsOpen: boolean;
}

interface VoltagePoint {
  voltage: number;
  torqueKgcm: number;
  speedSec60: number;
  idleMa: number;
  stallMa: number;
}

interface ServoSpec {
  bodyWidth: number;
  bodyHeight: number;
  bodyDepth: number;
  maxRangeDeg: number;
  points: VoltagePoint[];
}

const PROFILE_PRESETS: ProfilePreset[] = [
  {
    id: "claw",
    label: "Claw",
    mode: "servo_mode",
    rangePercent: 34,
    neutralUs: 0,
    reversed: false,
    pwmLossBehavior: "hold",
    softStart: true,
    pwmUs: 1900,
  },
  {
    id: "intake",
    label: "Intake",
    mode: "cr_mode",
    rangePercent: 100,
    neutralUs: 0,
    reversed: false,
    pwmLossBehavior: "release",
    softStart: false,
    pwmUs: 2000,
  },
  {
    id: "gate",
    label: "Gate",
    mode: "servo_mode",
    rangePercent: 22,
    neutralUs: 0,
    reversed: false,
    pwmLossBehavior: "neutral",
    softStart: true,
    pwmUs: 1700,
  },
  {
    id: "arm",
    label: "Arm",
    mode: "servo_mode",
    rangePercent: 56,
    neutralUs: 10,
    reversed: false,
    pwmLossBehavior: "hold",
    softStart: true,
    pwmUs: 1850,
  },
];

const MINI_SPEC: ServoSpec = {
  bodyWidth: 128,
  bodyHeight: 82,
  bodyDepth: 42,
  maxRangeDeg: 355,
  points: [
    { voltage: 4.8, torqueKgcm: 13, speedSec60: 0.16, idleMa: 140, stallMa: 2200 },
    { voltage: 6.0, torqueKgcm: 16, speedSec60: 0.13, idleMa: 170, stallMa: 2600 },
    { voltage: 7.4, torqueKgcm: 19, speedSec60: 0.11, idleMa: 190, stallMa: 3000 },
    { voltage: 8.4, torqueKgcm: 21, speedSec60: 0.1, idleMa: 210, stallMa: 3200 },
  ],
};

const MICRO_SPEC: ServoSpec = {
  bodyWidth: 96,
  bodyHeight: 62,
  bodyDepth: 34,
  maxRangeDeg: 360,
  points: [
    { voltage: 4.8, torqueKgcm: 4.2, speedSec60: 0.16, idleMa: 100, stallMa: 1000 },
    { voltage: 6.0, torqueKgcm: 5.2, speedSec60: 0.13, idleMa: 120, stallMa: 1300 },
    { voltage: 7.4, torqueKgcm: 6.5, speedSec60: 0.11, idleMa: 140, stallMa: 1600 },
    { voltage: 8.4, torqueKgcm: 7.1, speedSec60: 0.1, idleMa: 160, stallMa: 1800 },
  ],
};

const MAX_SPEC: ServoSpec = {
  bodyWidth: 150,
  bodyHeight: 92,
  bodyDepth: 46,
  maxRangeDeg: 360,
  points: [
    { voltage: 4.8, torqueKgcm: 28, speedSec60: 0.14, idleMa: 280, stallMa: 3600 },
    { voltage: 6.0, torqueKgcm: 34, speedSec60: 0.115, idleMa: 320, stallMa: 4000 },
    { voltage: 7.2, torqueKgcm: 39, speedSec60: 0.1, idleMa: 360, stallMa: 4300 },
    { voltage: 8.4, torqueKgcm: 45, speedSec60: 0.085, idleMa: 400, stallMa: 4600 },
  ],
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolatePoint(points: VoltagePoint[], voltage: number): VoltagePoint {
  const sorted = [...points].sort((a, b) => a.voltage - b.voltage);
  if (voltage <= sorted[0].voltage) return sorted[0];
  if (voltage >= sorted[sorted.length - 1].voltage) return sorted[sorted.length - 1];

  for (let index = 0; index < sorted.length - 1; index++) {
    const left = sorted[index];
    const right = sorted[index + 1];
    if (voltage >= left.voltage && voltage <= right.voltage) {
      const t = (voltage - left.voltage) / (right.voltage - left.voltage);
      return {
        voltage,
        torqueKgcm: lerp(left.torqueKgcm, right.torqueKgcm, t),
        speedSec60: lerp(left.speedSec60, right.speedSec60, t),
        idleMa: lerp(left.idleMa, right.idleMa, t),
        stallMa: lerp(left.stallMa, right.stallMa, t),
      };
    }
  }

  return sorted[0];
}

function rpmFromSec60(speedSec60: number): number {
  if (speedSec60 <= 0) return 0;
  return 10 / speedSec60;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function modeShort(mode: "servo_mode" | "cr_mode" | "unknown"): string {
  if (mode === "cr_mode") return "CR";
  if (mode === "servo_mode") return "SERVO";
  return "--";
}

function formatLoss(value: "release" | "hold" | "neutral"): string {
  if (value === "release") return "Let go";
  if (value === "hold") return "Hold";
  return "Center";
}

function profileById(profileId: string): ProfilePreset {
  return PROFILE_PRESETS.find((profile) => profile.id === profileId) ?? PROFILE_PRESETS[0];
}

function baseDraft(profileId = "claw"): DraftSetup {
  const profile = profileById(profileId);
  return {
    profileId: profile.id,
    mode: profile.mode,
    rangePercent: profile.rangePercent,
    neutralUs: profile.neutralUs,
    reversed: profile.reversed,
    pwmLossBehavior: profile.pwmLossBehavior,
    softStart: profile.softStart,
    pwmUs: profile.pwmUs,
    voltage: 6,
    loadPercent: 15,
  };
}

function modeFromConfig(config: ProbeConfigInfo | null): "servo_mode" | "cr_mode" {
  return config?.mode === "cr_mode" ? "cr_mode" : "servo_mode";
}

function draftFromConfig(config: ProbeConfigInfo | null, current: DraftSetup): DraftSetup {
  if (!config?.setup) return current;
  const suggestedProfile = config.mode === "cr_mode" ? "intake" : "claw";
  return {
    ...current,
    profileId: suggestedProfile,
    mode: modeFromConfig(config),
    rangePercent: clamp(config.setup.rangePercent ?? current.rangePercent, 10, 100),
    neutralUs: clamp(config.setup.neutralUs ?? current.neutralUs, -127, 127),
    reversed: config.setup.inversion === "reversed",
    pwmLossBehavior:
      config.setup.pwmLossBehavior === "hold" || config.setup.pwmLossBehavior === "neutral"
        ? config.setup.pwmLossBehavior
        : "release",
    softStart: config.setup.softStart ?? current.softStart,
  };
}

function selectProfile(profileId: string, current: DraftSetup): DraftSetup {
  const profile = profileById(profileId);
  return {
    ...current,
    profileId: profile.id,
    mode: profile.mode,
    rangePercent: profile.rangePercent,
    neutralUs: profile.neutralUs,
    reversed: profile.reversed,
    pwmLossBehavior: profile.pwmLossBehavior,
    softStart: profile.softStart,
    pwmUs: profile.pwmUs,
  };
}

function lookupSpec(
  modelId: string | null,
  modelName: string | null,
  config: ProbeConfigInfo | null,
): ServoSpec {
  if ((modelId ?? "").startsWith("SA20") || (modelName ?? "").toLowerCase().includes("micro")) {
    return MICRO_SPEC;
  }
  if ((modelId ?? "").startsWith("SA81") || (modelName ?? "").toLowerCase().includes("max")) {
    return MAX_SPEC;
  }

  if (config?.setup?.rangeDegrees) {
    return {
      ...MINI_SPEC,
      maxRangeDeg: Math.max(MINI_SPEC.maxRangeDeg, config.setup.rangeDegrees),
    };
  }

  return MINI_SPEC;
}

function nearlyEqual(a: number, b: number, epsilon = 1): boolean {
  return Math.abs(a - b) <= epsilon;
}

function isDirty(config: ProbeConfigInfo | null, draft: DraftSetup): boolean {
  if (!config?.setup) return false;
  return (
    config.mode !== draft.mode ||
    !nearlyEqual(config.setup.rangePercent ?? draft.rangePercent, draft.rangePercent) ||
    !nearlyEqual(config.setup.neutralUs ?? draft.neutralUs, draft.neutralUs) ||
    (config.setup.inversion === "reversed") !== draft.reversed ||
    (config.setup.pwmLossBehavior ?? "release") !== draft.pwmLossBehavior ||
    (config.setup.softStart ?? false) !== draft.softStart
  );
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatSignedUs(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function help(title: string): string {
  return `<span class="help" title="${escapeHtml(title)}">?</span>`;
}

function textForState(value: string | null): string {
  return value && value.length > 0 ? value : "--";
}

interface SimValues {
  spec: ServoSpec;
  rangeDeg: number;
  minAngle: number;
  maxAngle: number;
  hornAngle: number;
  spinDirection: -1 | 0 | 1;
  spinPeriod: number;
  rpm: number;
  torqueKgcm: number;
  powerW: number;
  efficiencyPercent: number;
  heatW: number;
  currentA: number;
  voltagePoint: VoltagePoint;
  powerLimit: number;
}

function deriveSimulation(config: ProbeConfigInfo | null, draft: DraftSetup): SimValues {
  const spec = lookupSpec(config?.modelId ?? null, config?.modelName ?? null, config);
  const voltagePoint = interpolatePoint(spec.points, draft.voltage);
  const noLoadRpm = rpmFromSec60(voltagePoint.speedSec60);
  const loadRatio = clamp(draft.loadPercent / 100, 0, 1);
  const powerLimit = clamp((config?.setup?.pwmPowerPercent ?? 85) / 100, 0.2, 1);
  const rangeDeg = Math.round((spec.maxRangeDeg * draft.rangePercent) / 100);

  let hornAngle = 0;
  let spinDirection: -1 | 0 | 1 = 0;
  let rpm = 0;

  const centeredPwm = 1500 + draft.neutralUs;

  if (draft.mode === "servo_mode") {
    const command = clamp((draft.pwmUs - centeredPwm) / 1000, -1, 1);
    const travel = (rangeDeg / 2) * command;
    hornAngle = draft.reversed ? -travel : travel;
    rpm = noLoadRpm * Math.abs(command) * 0.32 * powerLimit * Math.max(0.18, 1 - loadRatio * 0.72);
  } else {
    const drive = clamp((draft.pwmUs - centeredPwm) / 1000, -1, 1);
    const signedDrive = draft.reversed ? -drive : drive;
    spinDirection = signedDrive === 0 ? 0 : signedDrive > 0 ? 1 : -1;
    hornAngle = signedDrive > 0 ? 18 : signedDrive < 0 ? -18 : 0;
    rpm = noLoadRpm * Math.abs(signedDrive) * powerLimit * Math.max(0, 1 - loadRatio);
  }

  const torqueKgcm =
    voltagePoint.torqueKgcm * loadRatio * powerLimit * (draft.mode === "servo_mode" ? 0.82 : 1);
  const torqueNm = torqueKgcm * 0.0980665;
  const omega = (rpm * 2 * Math.PI) / 60;
  const powerW = torqueNm * omega;
  const currentA =
    (voltagePoint.idleMa +
      (voltagePoint.stallMa - voltagePoint.idleMa) *
        clamp(loadRatio * 0.85 + Math.abs(draft.pwmUs - centeredPwm) / 2000, 0, 1) *
        powerLimit) /
    1000;
  const electricalW = currentA * draft.voltage;
  const efficiencyPercent = clamp(electricalW > 0 ? (powerW / electricalW) * 100 : 0, 0, 92);
  const heatW = Math.max(0, electricalW - powerW);
  const spinPeriod = rpm > 1 ? clamp(60 / rpm, 0.35, 8) : 9;

  return {
    spec,
    rangeDeg,
    minAngle: -rangeDeg / 2,
    maxAngle: rangeDeg / 2,
    hornAngle,
    spinDirection,
    spinPeriod,
    rpm,
    torqueKgcm,
    powerW,
    efficiencyPercent,
    heatW,
    currentA,
    voltagePoint,
    powerLimit,
  };
}

export function mountProbeApp(options: MountProbeAppOptions): void {
  const state: ProbeState = {
    environment: null,
    inventory: { devices: [], openedId: null },
    identify: null,
    config: null,
    draft: baseDraft(),
    busyAction: null,
    error: null,
    logs: [],
    diagnosticsOpen: false,
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

  async function runAction<T>(
    name: string,
    task: () => Promise<T>,
    onSuccess: (result: T) => void,
  ): Promise<void> {
    if (state.busyAction) return;
    state.busyAction = name;
    state.error = null;
    render();
    try {
      const result = await task();
      onSuccess(result);
      log(name);
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      log(`${name} failed`);
    } finally {
      state.busyAction = null;
      render();
    }
  }

  async function doUsb(): Promise<void> {
    const usbAction = options.requestDevice ?? options.refreshInventory ?? options.reconnectDevice;
    if (!usbAction) return;
    await runAction("USB", usbAction.run, (inventory) => {
      updateInventory(inventory);
    });
  }

  async function doLink(): Promise<void> {
    if (state.inventory.openedId && options.closeDevice) {
      await runAction("Close", options.closeDevice.run, (inventory) => {
        updateInventory(inventory);
      });
      return;
    }

    if (!state.inventory.devices.length && options.reconnectDevice) {
      await runAction("Remembered", options.reconnectDevice.run, (inventory) => {
        updateInventory(inventory);
      });
      return;
    }

    if (options.openDevice) {
      await runAction("Link", options.openDevice.run, (inventory) => {
        updateInventory(inventory);
      });
    }
  }

  async function doSync(): Promise<void> {
    const readAction = options.readFullConfig;
    if (!readAction) return;
    await runAction("Sync", readAction.run, (config) => {
      state.config = config;
      state.identify = {
        present: true,
        statusHi: "0x01",
        statusLo: "0x00",
        modeByte: null,
        mode: config.mode,
        rawRx: state.identify?.rawRx ?? "",
      };
      state.draft = draftFromConfig(config, state.draft);
    });
  }

  function render(): void {
    const connected = Boolean(state.inventory.openedId);
    const visible = state.inventory.devices.length > 0;
    const servoPresent = state.identify?.present ?? Boolean(state.config);
    const dirty = isDirty(state.config, state.draft);
    const sim = deriveSimulation(state.config, state.draft);
    const bodyWidthPx = sim.spec.bodyWidth;
    const bodyDepthPx = Math.max(56, Math.round(sim.spec.bodyDepth * 1.7));
    const shaftOffsetX = Math.round(bodyWidthPx * 0.2);
    const shaftOffsetY = Math.round(bodyDepthPx * 0.5);
    const sweepDiameter = Math.max(240, Math.round(bodyWidthPx * 1.85));
    const assemblyWidth = bodyWidthPx + Math.round(sweepDiameter * 0.7);
    const assemblyHeight = Math.max(bodyDepthPx + 120, sweepDiameter * 0.9);
    const modelId = state.config?.modelId ?? null;
    const mode = state.config?.mode ?? state.identify?.mode ?? state.draft.mode;
    const canSync = connected && Boolean(options.readFullConfig) && !state.busyAction;
    const canLink = (!connected || Boolean(options.closeDevice)) && !state.busyAction;
    const canUsb =
      Boolean(options.requestDevice ?? options.refreshInventory ?? options.reconnectDevice) &&
      !state.busyAction;

    const hornStyle =
      state.draft.mode === "cr_mode" && sim.spinDirection !== 0
        ? `transform: rotate(${sim.hornAngle}deg); animation: spin ${sim.spinPeriod}s linear infinite; animation-direction: ${sim.spinDirection > 0 ? "normal" : "reverse"};`
        : `transform: rotate(${sim.hornAngle}deg);`;

    const diagnostics = {
      environment: state.environment,
      inventory: state.inventory,
      identify: state.identify,
      config: state.config,
      logs: state.logs,
      draft: state.draft,
    };

    options.root.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; }

        :root { color-scheme: light; }

        .shell {
          min-height: 100vh;
          padding: 12px;
          background: #f3f3f1;
          color: #111111;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .frame {
          max-width: 1380px;
          margin: 0 auto;
        }

        .topline {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          align-items: center;
          margin-bottom: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          background: #121212;
          color: #f8fafc;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }

        .brand {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          background: #e40014;
          box-shadow: 10px 0 0 #f8fafc;
          margin-right: 10px;
        }

        .toolbar {
          display: inline-flex;
          gap: 8px;
          align-items: center;
        }

        .tool {
          height: 32px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid #333333;
          background: #191919;
          color: #f8fafc;
          font: inherit;
          cursor: pointer;
        }

        .tool:hover:not(:disabled),
        .apply:hover:not(:disabled) {
          border-color: #6b7280;
        }

        .tool:disabled,
        .apply:disabled {
          cursor: default;
          opacity: 0.5;
        }

        .statebar {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }

        .state {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          min-width: 0;
          padding: 8px 10px;
          border-radius: 8px;
          background: #171717;
          border: 1px solid #2c2c2c;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .state-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #707070;
          flex: 0 0 auto;
        }

        .ok .state-dot { background: #00a544; }
        .warn .state-dot { background: #f99c00; }
        .live .state-dot { background: #e40014; }

        .apply {
          height: 32px;
          padding: 0 16px;
          border-radius: 8px;
          border: 1px solid #6d000c;
          background: #e40014;
          color: #ffffff;
          font: inherit;
          cursor: pointer;
        }

        .error {
          margin-bottom: 12px;
          padding: 10px 12px;
          border: 1px solid #f0b5bc;
          border-radius: 8px;
          background: #fff2f3;
          color: #8f1020;
          font-size: 13px;
          line-height: 1.35;
        }

        .workspace {
          display: grid;
          grid-template-columns: 360px minmax(0, 1fr);
          gap: 12px;
        }

        .pane {
          border: 1px solid #d7d7d2;
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
        }

        .settings {
          padding: 14px;
          display: grid;
          gap: 14px;
        }

        .chip-row,
        .mode-row,
        .loss-row {
          display: grid;
          gap: 8px;
        }

        .chip-row {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .mode-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .loss-row {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .chip,
        .mode-button,
        .loss-button {
          min-height: 42px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid #d5d8de;
          background: #f8f8f6;
          color: #111111;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .chip[data-selected="true"],
        .mode-button[data-selected="true"],
        .loss-button[data-selected="true"] {
          border-color: #111111;
          background: #ffffff;
          box-shadow: inset 0 0 0 1px #111111;
        }

        .setting {
          display: grid;
          gap: 8px;
        }

        .setting-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .setting-label {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          color: #4b5563;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .setting-value {
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 13px;
          font-weight: 700;
        }

        .help {
          display: inline-grid;
          place-items: center;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 1px solid #c9ced6;
          color: #69707d;
          font-size: 11px;
          line-height: 1;
          cursor: help;
          background: #ffffff;
        }

        .switch {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          padding: 0 12px;
          border: 1px solid #d5d8de;
          border-radius: 8px;
          background: #f8f8f6;
        }

        .switch input {
          width: 18px;
          height: 18px;
          accent-color: #111111;
        }

        .slider {
          width: 100%;
          margin: 0;
          accent-color: #e40014;
        }

        .sim {
          padding: 14px;
          display: grid;
          gap: 12px;
        }

        .servo-stage {
          position: relative;
          min-height: 440px;
          border-radius: 8px;
          border: 1px solid #e0e3e8;
          background:
            radial-gradient(circle at 50% 44%, #ffffff 0%, #f7f7f4 58%, #efefeb 100%);
          overflow: hidden;
        }

        .sim-meta {
          position: absolute;
          top: 14px;
          left: 14px;
          right: 14px;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          pointer-events: none;
        }

        .meta-pill {
          padding: 6px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid #dde1e6;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          font-weight: 700;
        }

        .servo-assembly {
          position: absolute;
          left: 50%;
          top: 55%;
          transform: translate(-50%, -50%);
        }

        .servo-sweep {
          position: absolute;
          border-radius: 999px;
          border: 1px solid #dfe3e8;
          background:
            radial-gradient(circle at center, transparent 0 26px, #ffffff 26px 30px, transparent 30px),
            radial-gradient(circle at center, transparent 0 84px, #e6e9ef 84px 86px, transparent 86px);
          opacity: 0.98;
        }

        .limit,
        .horn {
          position: absolute;
          left: 0;
          top: 0;
          transform-origin: 0 50%;
        }

        .limit {
          width: 112px;
          height: 4px;
          margin-top: -2px;
          border-radius: 999px;
          background: #b7bec9;
        }

        .horn {
          width: 124px;
          height: 6px;
          margin-top: -3px;
          border-radius: 999px;
          background: #e40014;
          box-shadow: 0 0 0 1px rgba(228, 0, 20, 0.08);
          transition: transform 240ms ease;
        }

        .hub {
          position: absolute;
          left: 0;
          top: 0;
          width: 24px;
          height: 24px;
          margin-left: -12px;
          margin-top: -12px;
          border-radius: 999px;
          background: #111111;
          box-shadow: 0 0 0 8px rgba(255, 255, 255, 0.94);
        }

        .servo-body {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          border-radius: 8px;
          background:
            linear-gradient(180deg, #1b1b1b 0%, #0f0f0f 100%);
          border: 1px solid #2f2f2f;
          box-shadow: 0 18px 30px rgba(17, 17, 17, 0.16);
        }

        .servo-top-plate {
          position: absolute;
          border-radius: 8px;
          border: 1px solid #2b2b2b;
          background: #1a1a1a;
        }

        .servo-front {
          position: absolute;
          width: 26px;
          height: 34px;
          border-radius: 8px 0 0 8px;
          background: #111111;
          border: 1px solid #2b2b2b;
        }

        .servo-wire {
          position: absolute;
          border-top: 3px solid #4b5563;
          border-right: 3px solid #4b5563;
          border-radius: 0 18px 0 0;
        }

        .sim-bottom {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 236px;
          gap: 12px;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }

        .metric {
          min-height: 74px;
          padding: 10px;
          border: 1px solid #d7d7d2;
          border-radius: 8px;
          background: #ffffff;
          display: grid;
          align-content: space-between;
        }

        .metric-value {
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 20px;
          font-weight: 700;
          line-height: 1;
        }

        .metric-unit {
          color: #69707d;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .metric-top {
          display: flex;
          justify-content: flex-end;
        }

        .driver {
          display: grid;
          gap: 12px;
          padding: 12px;
          border: 1px solid #d7d7d2;
          border-radius: 8px;
          background: #ffffff;
        }

        .ticks {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          color: #69707d;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }

        details.debug {
          margin-top: 12px;
        }

        details.debug > summary {
          list-style: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        details.debug > summary::-webkit-details-marker { display: none; }

        .debug-panel {
          margin-top: 8px;
          padding: 12px;
          border: 1px solid #d7d7d2;
          border-radius: 8px;
          background: #ffffff;
        }

        .debug-panel pre {
          margin: 0;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
          color: #1f2937;
          font-size: 12px;
          line-height: 1.4;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1180px) {
          .workspace,
          .sim-bottom {
            grid-template-columns: 1fr;
          }

          .metrics {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .shell { padding: 10px; }

          .topline {
            grid-template-columns: 1fr;
          }

          .statebar,
          .chip-row,
          .mode-row,
          .loss-row,
          .metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .servo-stage {
            min-height: 360px;
          }

          .servo-assembly {
            transform: translate(-50%, -50%) scale(0.82);
            transform-origin: center;
          }
        }
      </style>
      <div class="shell">
        <div class="frame">
          <div class="topline">
            <div class="toolbar">
              <span class="brand" aria-hidden="true"></span>
              <button class="tool" data-command="usb" ${!canUsb ? "disabled" : ""} title="Find the adapter on USB or reuse a remembered browser device.">USB</button>
              <button class="tool" data-command="link" ${!canLink ? "disabled" : ""} title="Open or release the adapter for this app.">Link</button>
              <button class="tool" data-command="sync" ${!canSync ? "disabled" : ""} title="Read the attached servo and copy its setup into the sim.">Sync</button>
            </div>
            <div class="statebar">
              <div class="state ${connected ? "ok" : visible ? "warn" : ""}" title="Adapter state">
                <span class="state-dot"></span><span>${connected ? "USB OK" : visible ? "USB" : "USB --"}</span>
              </div>
              <div class="state ${servoPresent ? "ok" : connected ? "warn" : ""}" title="Servo state">
                <span class="state-dot"></span><span>${servoPresent ? "SRV OK" : "SRV --"}</span>
              </div>
              <div class="state ${modelId ? "ok" : ""}" title="Model id">
                <span class="state-dot"></span><span>${escapeHtml(textForState(modelId))}</span>
              </div>
              <div class="state ${mode !== "unknown" ? "ok" : ""}" title="Mode">
                <span class="state-dot"></span><span>${escapeHtml(modeShort(mode))}</span>
              </div>
              <div class="state ${dirty ? "live" : state.config ? "ok" : ""}" title="Draft vs live">
                <span class="state-dot"></span><span>${dirty ? "DIRTY" : state.config ? "LIVE" : "--"}</span>
              </div>
            </div>
            <button class="apply" data-command="apply" ${!dirty || !state.config ? "disabled" : ""} title="Write the draft back to the servo. Not wired in this probe yet.">Apply</button>
          </div>

          ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}

          <div class="workspace">
            <section class="pane settings">
              <div class="chip-row">
                ${PROFILE_PRESETS.map(
                  (profile) => `
                    <button class="chip" data-profile-id="${escapeHtml(profile.id)}" data-selected="${profile.id === state.draft.profileId}" title="Profile">
                      ${escapeHtml(profile.label)}
                    </button>
                  `,
                ).join("")}
              </div>

              <div class="mode-row">
                <button class="mode-button" data-mode="servo_mode" data-selected="${state.draft.mode === "servo_mode"}" title="Position control mode">Servo</button>
                <button class="mode-button" data-mode="cr_mode" data-selected="${state.draft.mode === "cr_mode"}" title="Continuous rotation mode">CR</button>
              </div>

              <div class="setting">
                <div class="setting-head">
                  <span class="setting-label">Range ${help("How much of the servo travel is active.")}</span>
                  <span class="setting-value">${sim.rangeDeg}&deg;</span>
                </div>
                <input class="slider" data-slider="range" type="range" min="10" max="100" step="1" value="${state.draft.rangePercent}" />
              </div>

              <div class="setting">
                <div class="setting-head">
                  <span class="setting-label">Center ${help("Trim the PWM center point around 1500 us.")}</span>
                  <span class="setting-value">${escapeHtml(formatSignedUs(state.draft.neutralUs))} us</span>
                </div>
                <input class="slider" data-slider="neutral" type="range" min="-127" max="127" step="1" value="${state.draft.neutralUs}" />
              </div>

              <div class="switch" title="Reverse direction">
                <span class="setting-label">Dir ${help("Reverse the simulated direction.")}</span>
                <input data-toggle="reversed" type="checkbox" ${state.draft.reversed ? "checked" : ""} />
              </div>

              <div class="switch" title="Soft start">
                <span class="setting-label">Ramp ${help("Ease into motion instead of snapping immediately.")}</span>
                <input data-toggle="softStart" type="checkbox" ${state.draft.softStart ? "checked" : ""} />
              </div>

              <div class="loss-row">
                ${(["release", "hold", "neutral"] as const)
                  .map(
                    (modeValue) => `
                      <button
                        class="loss-button"
                        data-loss="${modeValue}"
                        data-selected="${state.draft.pwmLossBehavior === modeValue}"
                        title="PWM loss behavior"
                      >
                        ${escapeHtml(formatLoss(modeValue))}
                      </button>
                    `,
                  )
                  .join("")}
              </div>
            </section>

            <section class="pane sim">
              <div class="servo-stage">
                <div class="sim-meta">
                  <span class="meta-pill" title="Attached model">${escapeHtml(textForState(state.config?.modelName ?? null))}</span>
                  <span class="meta-pill" title="Power limit from current config">${Math.round(sim.powerLimit * 100)}%</span>
                </div>

                <div
                  class="servo-assembly"
                  style="width:${assemblyWidth}px; height:${assemblyHeight}px;"
                >
                  <div
                    class="servo-sweep"
                    style="left:${shaftOffsetX - sweepDiameter / 2}px; top:${shaftOffsetY - sweepDiameter / 2}px; width:${sweepDiameter}px; height:${sweepDiameter}px;"
                  ></div>
                  <div
                    class="servo-body"
                    style="width:${bodyWidthPx}px; height:${bodyDepthPx}px;"
                    title="${escapeHtml(state.config?.modelName ?? "Servo proxy")}"
                  ></div>
                  <div
                    class="servo-top-plate"
                    style="left:${Math.round(bodyWidthPx * 0.28)}px; top:${Math.round(bodyDepthPx * 0.18)}px; width:${Math.round(bodyWidthPx * 0.48)}px; height:${Math.round(bodyDepthPx * 0.64)}px;"
                  ></div>
                  <div
                    class="servo-front"
                    style="left:${Math.round(bodyWidthPx - 18)}px; top:${Math.round((bodyDepthPx - 34) / 2)}px;"
                  ></div>
                  <div
                    class="limit"
                    style="left:${shaftOffsetX}px; top:${shaftOffsetY}px; transform: rotate(${sim.minAngle}deg);"
                  ></div>
                  <div
                    class="limit"
                    style="left:${shaftOffsetX}px; top:${shaftOffsetY}px; transform: rotate(${sim.maxAngle}deg);"
                  ></div>
                  <div
                    class="horn"
                    style="left:${shaftOffsetX}px; top:${shaftOffsetY}px; ${hornStyle}"
                  ></div>
                  <div
                    class="hub"
                    style="left:${shaftOffsetX}px; top:${shaftOffsetY}px;"
                  ></div>
                  <div
                    class="servo-wire"
                    style="left:${bodyWidthPx - 4}px; top:${Math.round(bodyDepthPx / 2) - 10}px; width:132px; height:28px;"
                    aria-hidden="true"
                  ></div>
                </div>
              </div>

              <div class="sim-bottom">
                <div>
                  <div class="setting">
                    <div class="setting-head">
                      <span class="setting-label">PWM ${help("Drive signal from 500 us to 2500 us with center at 1500 us.")}</span>
                      <span class="setting-value">${state.draft.pwmUs} us</span>
                    </div>
                    <input class="slider" data-slider="pwm" type="range" min="500" max="2500" step="10" value="${state.draft.pwmUs}" />
                    <div class="ticks"><span>500</span><span>1500</span><span>2500</span></div>
                  </div>

                  <div class="metrics">
                    <div class="metric" title="Output speed">
                      <div class="metric-top">${help("No-load and loaded speed estimate at the chosen voltage.")}</div>
                      <div class="metric-value">${Math.round(sim.rpm)}</div>
                      <div class="metric-unit">rpm</div>
                    </div>
                    <div class="metric" title="Torque">
                      <div class="metric-top">${help("Load torque estimate.")}</div>
                      <div class="metric-value">${sim.torqueKgcm.toFixed(1)}</div>
                      <div class="metric-unit">kg.cm</div>
                    </div>
                    <div class="metric" title="Electrical power">
                      <div class="metric-top">${help("Voltage times current.")}</div>
                      <div class="metric-value">${sim.powerW.toFixed(1)}</div>
                      <div class="metric-unit">W mech</div>
                    </div>
                    <div class="metric" title="Heat">
                      <div class="metric-top">${help("Estimated electrical loss not turned into motion.")}</div>
                      <div class="metric-value">${sim.heatW.toFixed(1)}</div>
                      <div class="metric-unit">W heat</div>
                    </div>
                    <div class="metric" title="Efficiency">
                      <div class="metric-top">${help("Mechanical power divided by electrical power.")}</div>
                      <div class="metric-value">${Math.round(sim.efficiencyPercent)}</div>
                      <div class="metric-unit">%</div>
                    </div>
                  </div>
                </div>

                <div class="driver">
                  <div class="setting">
                    <div class="setting-head">
                      <span class="setting-label">V ${help("Operating voltage.")}</span>
                      <span class="setting-value">${state.draft.voltage.toFixed(1)} V</span>
                    </div>
                    <input class="slider" data-slider="voltage" type="range" min="4.8" max="8.4" step="0.1" value="${state.draft.voltage}" />
                  </div>

                  <div class="setting">
                    <div class="setting-head">
                      <span class="setting-label">Load ${help("Mechanical load as a percent of stall torque.")}</span>
                      <span class="setting-value">${state.draft.loadPercent}%</span>
                    </div>
                    <input class="slider" data-slider="load" type="range" min="0" max="100" step="1" value="${state.draft.loadPercent}" />
                  </div>

                  <div class="metrics">
                    <div class="metric" title="Current">
                      <div class="metric-top">${help("Current draw estimate.")}</div>
                      <div class="metric-value">${sim.currentA.toFixed(2)}</div>
                      <div class="metric-unit">A</div>
                    </div>
                    <div class="metric" title="Stall torque at current voltage">
                      <div class="metric-top">${help("Interpolated from the model spec.")}</div>
                      <div class="metric-value">${sim.voltagePoint.torqueKgcm.toFixed(0)}</div>
                      <div class="metric-unit">stall</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <details class="debug" ${state.diagnosticsOpen ? "open" : ""}>
            <summary>${help("Diagnostics and raw replies")}</summary>
            <div class="debug-panel">
              <pre>${escapeHtml(toPrettyJson(diagnostics))}</pre>
            </div>
          </details>
        </div>
      </div>
    `;

    options.root.querySelectorAll<HTMLButtonElement>("[data-profile-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.draft = selectProfile(button.dataset.profileId ?? "claw", state.draft);
        render();
      });
    });

    options.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.draft.mode = button.dataset.mode === "cr_mode" ? "cr_mode" : "servo_mode";
        if (state.draft.mode === "cr_mode" && state.draft.profileId === "claw") {
          state.draft.profileId = "intake";
        }
        render();
      });
    });

    options.root.querySelectorAll<HTMLButtonElement>("[data-loss]").forEach((button) => {
      button.addEventListener("click", () => {
        const next =
          button.dataset.loss === "hold" || button.dataset.loss === "neutral"
            ? button.dataset.loss
            : "release";
        state.draft.pwmLossBehavior = next;
        render();
      });
    });

    options.root.querySelectorAll<HTMLInputElement>("[data-slider]").forEach((input) => {
      input.addEventListener("input", () => {
        switch (input.dataset.slider) {
          case "range":
            state.draft.rangePercent = clamp(Number(input.value), 10, 100);
            break;
          case "neutral":
            state.draft.neutralUs = clamp(Number(input.value), -127, 127);
            break;
          case "pwm":
            state.draft.pwmUs = clamp(Number(input.value), 500, 2500);
            break;
          case "voltage":
            state.draft.voltage = clamp(Number(input.value), 4.8, 8.4);
            break;
          case "load":
            state.draft.loadPercent = clamp(Number(input.value), 0, 100);
            break;
          default:
            break;
        }
        render();
      });
    });

    options.root.querySelectorAll<HTMLInputElement>("[data-toggle]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.dataset.toggle === "reversed") {
          state.draft.reversed = input.checked;
        }
        if (input.dataset.toggle === "softStart") {
          state.draft.softStart = input.checked;
        }
        render();
      });
    });

    const details = options.root.querySelector<HTMLDetailsElement>("details.debug");
    if (details) {
      details.addEventListener("toggle", () => {
        state.diagnosticsOpen = details.open;
      });
    }

    options.root.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
      button.addEventListener("click", () => {
        const command = button.dataset.command;
        if (command === "usb") void doUsb();
        if (command === "link") void doLink();
        if (command === "sync") void doSync();
        if (command === "apply") {
          state.error = "Apply is not wired in this probe yet.";
          log("Apply pending");
          render();
        }
      });
    });
  }

  async function bootstrap(): Promise<void> {
    log("Boot");
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
      log("Boot failed");
    }
    render();
  }

  void bootstrap();
}
