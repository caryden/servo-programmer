import { Buffer } from "node:buffer";
import { findModel, loadCatalog } from "@axon/core/catalog";
import { servoModeLabel, summarizeConfig } from "@axon/core/config-summary";
import {
  CONFIG_BLOCK_SIZE,
  type ServoMode as CoreServoMode,
  modelIdFromConfig,
} from "@axon/core/driver/protocol";
import {
  AXON_MINI_SPEC,
  lookupServoSpec,
  type ServoSpec,
  type VoltagePoint,
} from "@axon/core/servo-specs";
import { decryptSfw } from "@axon/core/sfw";
import {
  Chart,
  type ChartDataset,
  type ChartOptions,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  type Plugin,
  PointElement,
  Tooltip,
  type TooltipModel,
} from "chart.js";

const operatingPointMarkerPlugin: Plugin<"line"> = {
  id: "operatingPointMarker",
  afterDatasetsDraw(chart) {
    const datasets = chart.data.datasets as Array<
      ChartDataset<"line", ChartPoint[]> & {
        operatingMarker?: boolean;
        markerFill?: string;
        markerStroke?: string;
        markerRadius?: number;
      }
    >;
    const xScale = chart.scales.x;
    if (!xScale) return;

    const ctx = chart.ctx;
    for (const dataset of datasets) {
      if (!dataset.operatingMarker) continue;
      const point = dataset.data?.[0];
      if (!point || typeof point.x !== "number" || typeof point.y !== "number") continue;
      const yAxisId = dataset.yAxisID ?? "y";
      const yScale = chart.scales[yAxisId];
      if (!yScale) continue;

      const x = xScale.getPixelForValue(point.x);
      const y = yScale.getPixelForValue(point.y);
      const radius = dataset.markerRadius ?? 6;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = dataset.markerFill ?? "#8fc2f8";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = dataset.markerStroke ?? "#2d78d0";
      ctx.stroke();
      ctx.restore();
    }
  },
};

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  operatingPointMarkerPlugin,
);

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
  sensitivityStep: number | null;
  sensitivityLabel: string | null;
  dampeningFactor: number | null;
  overloadProtectionEnabled: boolean | null;
  overloadLevels: Array<{ pct: number; sec: number }>;
  pwmPowerPercent: number | null;
  proptlSeconds: number | null;
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
  rawBytes: number[] | null;
}

interface ProbeAction<T> {
  label: string;
  run: () => Promise<T>;
}

interface ProbeValueAction<TArg, TResult> {
  label: string;
  run: (arg: TArg) => Promise<TResult>;
}

export interface ProbeLoadedFile {
  name: string;
  format: "axon" | "svo";
  text?: string;
  bytes?: number[];
}

export interface ProbeSavedFile {
  path: string | null;
}

export interface ProbeFirmwareFile {
  name: string;
  bytes: number[];
}

export interface ProbeFlashProgressEvent {
  phase: string;
  bytesSent?: number;
  bytesTotal?: number;
  recordsSent?: number;
  recordsTotal?: number;
  message?: string;
}

export interface MountProbeAppOptions {
  root: HTMLElement;
  autoConnectOnLoad?: boolean;
  debugEnabled?: boolean;
  initialAuthorizedAccess?: boolean;
  livePollIntervalMs?: number;
  subscribeTransportLog?: (push: (message: string) => void) => undefined | (() => void);
  subscribeStatusLog?: (push: (message: string) => void) => undefined | (() => void);
  watchInventory?: (onInventory: (inventory: ProbeInventory) => void) => undefined | (() => void);
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
  writeFullConfig?: ProbeValueAction<Uint8Array, void>;
  loadConfigFile?: ProbeAction<ProbeLoadedFile | null>;
  loadFirmwareFile?: ProbeAction<ProbeFirmwareFile | null>;
  saveAxonFile?: ProbeValueAction<
    { suggestedName: string; text: string },
    ProbeSavedFile | undefined
  >;
  exportSvoFile?: ProbeValueAction<
    { suggestedName: string; bytes: number[] },
    ProbeSavedFile | undefined
  >;
  flashModeChange?: ProbeValueAction<
    {
      targetMode: ServoMode;
      modelId: string;
      onProgress?: (event: ProbeFlashProgressEvent) => void;
    },
    void
  >;
  flashFirmwareFile?: ProbeValueAction<
    {
      bytes: Uint8Array;
      expectedModelId?: string;
      onProgress?: (event: ProbeFlashProgressEvent) => void;
    },
    void
  >;
}

interface LogEntry {
  timestamp: string;
  message: string;
  level: "status" | "debug";
}

type ServoMode = "servo_mode" | "cr_mode";
type LossBehavior = "release" | "hold" | "neutral";
type Direction = "cw" | "ccw";
type SensitivityLabel = "Ultra High" | "High" | "Medium" | "Low" | "Very Low";

interface OverloadLevel {
  pct: number;
  sec: number;
}

interface DraftConfig {
  mode: ServoMode;
  rangePercent: number;
  neutralUs: number;
  direction: Direction;
  pwmLossBehavior: LossBehavior;
  softStart: boolean;
  sensitivityStep: number;
  dampeningFactor: number;
  overloadProtectionEnabled: boolean;
  overloadLevels: [OverloadLevel, OverloadLevel, OverloadLevel];
  pwmPowerPercent: number;
  proptlSeconds: number;
}

interface SimState {
  pwmUs: number;
  voltage: number;
  loadKgcm: number;
  sweepEnabled: boolean;
  playbackRunning: boolean;
  servoSweepPhase: number;
  crAngleDeg: number;
}

interface ConfigCheckpoint {
  id: string;
  createdAt: string;
  label: string;
  modelId: string | null;
  modelName: string | null;
  draft: DraftConfig;
}

interface ProbeState {
  environment: unknown | null;
  inventory: ProbeInventory;
  identify: ProbeIdentifyInfo | null;
  config: ProbeConfigInfo | null;
  lastKnownModelId: string | null;
  lastKnownModelName: string | null;
  draft: DraftConfig;
  baselineRawBytes: number[] | null;
  liveSnapshot: DraftConfig | null;
  checkpoints: ConfigCheckpoint[];
  sim: SimState;
  busyAction: string | null;
  applyProgress: {
    title: string;
    detail: string;
    percent: number;
  } | null;
  error: string | null;
  logs: LogEntry[];
  statusMessage: string;
  statusOpen: boolean;
  loadPanelOpen: boolean;
  recoveryConfirmOpen: boolean;
  recoverySource: "bundled" | "file";
  recoveryBundledModelId: string;
  recoveryBundledMode: ServoMode;
  recoveryFile: ProbeFirmwareFile | null;
  recoveryFileModelId: string | null;
  recoveryFileModelName: string | null;
  hasAuthorizedAccess: boolean;
  diagnosticsOpen: boolean;
}

type EmptyStateKind = "adapter" | "servo" | null;

interface CurvePoint {
  torqueKgcm: number;
  speedRpm: number;
  currentA: number;
  mechanicalPowerW: number;
  electricalPowerW: number;
  heatW: number;
  efficiency: number;
}

interface OperatingPoint extends CurvePoint {
  pwmUs: number;
  hornAngleDeg: number;
  minAngleDeg: number;
  maxAngleDeg: number;
  effectiveVoltage: number;
  commandMagnitude: number;
  commandSigned: number;
}

interface ChartPoint {
  x: number;
  y: number;
}

interface TooltipRow {
  label: string;
  si: string;
  imp: string;
  servo: string;
}

interface TooltipTableData {
  rows: TooltipRow[];
}

interface ProbeCharts {
  speedCurrent: Chart<"line", ChartPoint[]>;
  power: Chart<"line", ChartPoint[]>;
  efficiency: Chart<"line", ChartPoint[]>;
}

const CHECKPOINT_STORAGE_KEY = "axon-config-checkpoints-v1";
const MAX_CHECKPOINTS = 12;
const RESIZE_POLL_QUIET_MS = 600;
const FIXED_LEFT_AXIS_WIDTH = 86;
const FIXED_RIGHT_AXIS_WIDTH = 74;
const RECOVERY_MODELS = Array.from(loadCatalog().models.values())
  .filter((model) => model.bundled_firmware.standard || model.bundled_firmware.continuous)
  .sort((left, right) => left.name.localeCompare(right.name));
const HELP_TEXT = {
  range:
    "Sets the servo travel limit. 100% uses the model's full programmed range; lower values narrow the green-to-red sweep.",
  sensitivity:
    "PWM dead-band around neutral. Lower step means smaller dead-band and higher sensitivity. Step 0 is the most sensitive setting.",
  center:
    "Offsets the neutral position in microseconds from the nominal 1500 us center pulse. Use this to trim the mechanical center.",
  stopTrim:
    "Offsets the stop point in microseconds from the nominal 1500 us pulse in CR mode. Use this to stop rotation cleanly.",
  direction:
    "Reverses the commanded direction. Vendor default is CCW for normal; reversed flips the response.",
  ramp: "Limits acceleration on startup to reduce sudden motion.",
  dampening:
    "Internal PID D coefficient in Servo mode. Higher values add more braking near the target and can reduce overshoot.",
  signalLoss:
    "What the servo should do if PWM signal is lost while power remains. Release removes drive, Hold keeps the last commanded position, Neutral moves to center.",
  overload:
    "Three-stage stall protection in Servo mode. When the servo stalls, it reduces available power to each stage's percentage after that stage's delay.",
  proptl:
    "Continuous-rotation overheat timeout in seconds. After continuous operation for this long, the servo cuts output to protect the motor.",
  powerLimit:
    "Caps maximum output power as a percentage of full drive. Useful for limiting current draw or softening the servo.",
  pwmServo:
    "Simulated command pulse width in Servo mode. Sweep/manual motion changes the horn position, but not the Servo-mode operating-point physics.",
  pwmCr:
    "Simulated CR drive command. 1500 us is stop; farther from center increases drive in the selected direction.",
  voltage:
    "Supply voltage used for the operating curves. Detents match the published servo spec voltages, but you can set values between them.",
  load: "Mechanical output load in kgf*cm. Higher load moves the operating point toward stall torque.",
  diagnostics: "Show decoded state, transport details, and debug logs.",
} as const;

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
        idleA: lerp(left.idleA, right.idleA, t),
        stallA: lerp(left.stallA, right.stallA, t),
      };
    }
  }

  return sorted[0];
}

function rpmFromSec60(speedSec60: number): number {
  if (speedSec60 <= 0) return 0;
  return 10 / speedSec60;
}

function kgcmToNm(value: number): number {
  return value * 0.0980665;
}

function kgcmToOzIn(value: number): number {
  return value * 13.887;
}

function rpmToRadPerSec(value: number): number {
  return (value * 2 * Math.PI) / 60;
}

function rpmToSecPer60Deg(value: number): number {
  if (value <= 0.001) return Number.POSITIVE_INFINITY;
  return 10 / value;
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
  const now = new Date();
  const core = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${core}.${now.getMilliseconds().toString().padStart(3, "0")}`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Unknown";
  const deltaSec = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(deltaSec) >= 86400) {
    return rtf.format(Math.round(deltaSec / 86400), "day");
  }
  if (Math.abs(deltaSec) >= 3600) {
    return rtf.format(Math.round(deltaSec / 3600), "hour");
  }
  if (Math.abs(deltaSec) >= 60) {
    return rtf.format(Math.round(deltaSec / 60), "minute");
  }
  return rtf.format(deltaSec, "second");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function lossLabel(loss: LossBehavior): string {
  if (loss === "release") return "Release";
  if (loss === "hold") return "Hold";
  return "Neutral";
}

function directionLabel(direction: Direction): string {
  return direction === "cw" ? "CW" : "CCW";
}

function sensitivityLabel(step: number): SensitivityLabel {
  if (step <= 1) return "Ultra High";
  if (step <= 4) return "High";
  if (step <= 8) return "Medium";
  if (step <= 11) return "Low";
  return "Very Low";
}

function shortModelLabel(value: string | null): string {
  if (!value || value.length === 0) return "--";
  return value.replace(/^Axon\s+/i, "");
}

function servoIdentityLabel(config: ProbeConfigInfo | null, servoPresent: boolean): string {
  const modelName = shortModelLabel(config?.modelName ?? null);
  if (modelName !== "--") return modelName;

  const modelId = (config?.modelId ?? "").trim();
  if (modelId.length > 0) return modelId;

  return servoPresent ? "Detected" : "Not Found";
}

function baseDraft(): DraftConfig {
  return {
    mode: "servo_mode",
    rangePercent: 50,
    neutralUs: 0,
    direction: "cw",
    pwmLossBehavior: "hold",
    softStart: true,
    sensitivityStep: 4,
    dampeningFactor: 166,
    overloadProtectionEnabled: true,
    overloadLevels: [
      { pct: 55, sec: 4.0 },
      { pct: 75, sec: 2.0 },
      { pct: 100, sec: 0.8 },
    ],
    pwmPowerPercent: 85,
    proptlSeconds: 25.5,
  };
}

function baseSim(config: DraftConfig = baseDraft()): SimState {
  return {
    pwmUs: config.mode === "cr_mode" ? 2000 : 1500,
    voltage: 6,
    loadKgcm:
      config.mode === "cr_mode"
        ? 0
        : peakEfficiencyLoadKgcm(AXON_MINI_SPEC, 6, config.pwmPowerPercent),
    sweepEnabled: config.mode === "servo_mode",
    playbackRunning: true,
    servoSweepPhase: 0,
    crAngleDeg: 0,
  };
}

function cloneDraftConfig(draft: DraftConfig): DraftConfig {
  return {
    ...draft,
    overloadLevels: draft.overloadLevels.map((level) => ({
      ...level,
    })) as DraftConfig["overloadLevels"],
  };
}

function draftKey(draft: DraftConfig | null): string | null {
  if (!draft) return null;
  return JSON.stringify(draft);
}

function isDirty(baseline: DraftConfig | null, draft: DraftConfig): boolean {
  return draftKey(baseline) !== null && draftKey(baseline) !== draftKey(draft);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function readStoredCheckpoints(): ConfigCheckpoint[] {
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value) => value && typeof value === "object" && typeof value.id === "string")
      .map((value) => ({
        id: String(value.id),
        createdAt: String(value.createdAt ?? ""),
        label: String(value.label ?? "checkpoint"),
        modelId: typeof value.modelId === "string" ? value.modelId : null,
        modelName: typeof value.modelName === "string" ? value.modelName : null,
        draft: cloneDraftConfig(value.draft as DraftConfig),
      }))
      .slice(0, MAX_CHECKPOINTS);
  } catch {
    return [];
  }
}

function writeStoredCheckpoints(checkpoints: ConfigCheckpoint[]): void {
  try {
    window.localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(checkpoints));
  } catch {}
}

function checkpointLabel(config: ProbeConfigInfo, createdAt: string): string {
  const model = shortModelLabel(config.modelName ?? config.modelId ?? "servo").toLowerCase();
  return `${model}-${createdAt.replaceAll(":", "-")}`;
}

function parseRecoveryFirmwareFile(file: ProbeFirmwareFile): {
  modelId: string;
  modelName: string | null;
} {
  const decrypted = decryptSfw(Buffer.from(file.bytes));
  const modelId = decrypted.header.modelId;
  const model = findModel(loadCatalog(), modelId);
  return {
    modelId,
    modelName: model?.name ?? null,
  };
}

function recoveryTargetFromState(
  state: ProbeState,
): { modelId: string; modelName: string | null } | null {
  if (state.lastKnownModelId) {
    return {
      modelId: state.lastKnownModelId,
      modelName: state.lastKnownModelName,
    };
  }
  const checkpoint = state.checkpoints.find((entry) => Boolean(entry.modelId));
  if (!checkpoint?.modelId) return null;
  return {
    modelId: checkpoint.modelId,
    modelName: checkpoint.modelName,
  };
}

function modeFromConfig(config: ProbeConfigInfo | null): ServoMode {
  return config?.mode === "cr_mode" ? "cr_mode" : "servo_mode";
}

function normalizeOverloadLevel(
  value: Partial<OverloadLevel> | undefined,
  fallback: OverloadLevel,
): OverloadLevel {
  return {
    pct: clamp(Number(value?.pct ?? fallback.pct), 10, 100),
    sec: clamp(Number(value?.sec ?? fallback.sec), 0, 25.5),
  };
}

function normalizeOverloadLevels(
  values: Array<Partial<OverloadLevel>> | undefined,
  fallback: DraftConfig["overloadLevels"],
): DraftConfig["overloadLevels"] {
  return [
    normalizeOverloadLevel(values?.[0], fallback[0]),
    normalizeOverloadLevel(values?.[1], fallback[1]),
    normalizeOverloadLevel(values?.[2], fallback[2]),
  ];
}

function draftFromConfig(config: ProbeConfigInfo | null, current: DraftConfig): DraftConfig {
  if (!config?.setup) return current;
  return {
    ...current,
    mode: modeFromConfig(config),
    rangePercent: clamp(config.setup.rangePercent ?? current.rangePercent, 10, 100),
    neutralUs: clamp(config.setup.neutralUs ?? current.neutralUs, -127, 127),
    direction: config.setup.inversion === "reversed" ? "ccw" : "cw",
    pwmLossBehavior:
      config.setup.pwmLossBehavior === "hold" || config.setup.pwmLossBehavior === "neutral"
        ? config.setup.pwmLossBehavior
        : "release",
    softStart: config.setup.softStart ?? current.softStart,
    sensitivityStep: clamp(config.setup.sensitivityStep ?? current.sensitivityStep, 0, 14),
    dampeningFactor: clamp(config.setup.dampeningFactor ?? current.dampeningFactor, 0, 65535),
    overloadProtectionEnabled:
      config.setup.overloadProtectionEnabled ?? current.overloadProtectionEnabled,
    overloadLevels: normalizeOverloadLevels(config.setup.overloadLevels, current.overloadLevels),
    pwmPowerPercent: clamp(config.setup.pwmPowerPercent ?? current.pwmPowerPercent, 0, 100),
    proptlSeconds: clamp(config.setup.proptlSeconds ?? current.proptlSeconds, 0, 25.5),
  };
}

function draftFromPartial(configDraft: Partial<DraftConfig>, current: DraftConfig): DraftConfig {
  return {
    ...current,
    ...configDraft,
    mode: configDraft.mode === "cr_mode" ? "cr_mode" : "servo_mode",
    direction: configDraft.direction === "ccw" ? "ccw" : "cw",
    pwmLossBehavior:
      configDraft.pwmLossBehavior === "hold" || configDraft.pwmLossBehavior === "neutral"
        ? configDraft.pwmLossBehavior
        : "release",
    rangePercent: clamp(Number(configDraft.rangePercent ?? current.rangePercent), 10, 100),
    neutralUs: clamp(Number(configDraft.neutralUs ?? current.neutralUs), -127, 127),
    sensitivityStep: clamp(Number(configDraft.sensitivityStep ?? current.sensitivityStep), 0, 14),
    dampeningFactor: clamp(
      Number(configDraft.dampeningFactor ?? current.dampeningFactor),
      0,
      65535,
    ),
    overloadProtectionEnabled: Boolean(
      configDraft.overloadProtectionEnabled ?? current.overloadProtectionEnabled,
    ),
    overloadLevels: normalizeOverloadLevels(
      Array.isArray(configDraft.overloadLevels) ? configDraft.overloadLevels : undefined,
      current.overloadLevels,
    ),
    pwmPowerPercent: clamp(Number(configDraft.pwmPowerPercent ?? current.pwmPowerPercent), 0, 100),
    proptlSeconds: clamp(Number(configDraft.proptlSeconds ?? current.proptlSeconds), 0, 25.5),
  };
}

function encodeRangeRaw(percent: number): number {
  return clamp(Math.round((clamp(percent, 10, 100) * 255) / 100), 0, 255);
}

function encodeNeutralRaw(us: number): number {
  return clamp(Math.round(clamp(us, -127, 127) + 128), 1, 255);
}

function encodeSensitivityRaw(step: number): number {
  return (clamp(Math.round(step), 0, 14) + 1) * 16;
}

function encodePercentRaw(percent: number): number {
  return clamp(Math.round((clamp(percent, 0, 100) * 255) / 100), 0, 255);
}

function encodeSecondsTenthRaw(seconds: number): number {
  return clamp(Math.round(clamp(seconds, 0, 25.5) / 0.1), 0, 255);
}

function setBeU16(bytes: Uint8Array, offset: number, value: number): void {
  const clamped = clamp(Math.round(value), 0, 65535);
  bytes[offset] = (clamped >> 8) & 0xff;
  bytes[offset + 1] = clamped & 0xff;
}

function encodeDraftOntoRawConfig(source: Uint8Array, draft: DraftConfig): Uint8Array {
  const bytes = Uint8Array.from(source);
  const rangeRaw = encodeRangeRaw(draft.rangePercent);
  bytes[0x04] = rangeRaw;
  bytes[0x05] = rangeRaw;
  bytes[0x06] = encodeNeutralRaw(draft.neutralUs);
  bytes[0x0c] = encodeSensitivityRaw(draft.sensitivityStep);

  setBeU16(bytes, 0x0a, draft.dampeningFactor);
  setBeU16(bytes, 0x27, draft.dampeningFactor);
  setBeU16(bytes, 0x29, draft.dampeningFactor);
  setBeU16(bytes, 0x2b, draft.dampeningFactor);

  const flags = bytes[0x25] ?? 0;
  const directionBits = draft.direction === "ccw" ? 0x02 : 0x00;
  const pwmLossBits =
    draft.pwmLossBehavior === "hold" ? 0x40 : draft.pwmLossBehavior === "neutral" ? 0x60 : 0x00;
  const softStartBits = draft.softStart ? 0x10 : 0x00;
  const overloadBits = draft.overloadProtectionEnabled ? 0x80 : 0x00;
  bytes[0x25] = (flags & ~0xf2) | directionBits | pwmLossBits | softStartBits | overloadBits;

  draft.overloadLevels.forEach((level, index) => {
    bytes[0x35 + index * 2] = encodePercentRaw(level.pct);
    bytes[0x36 + index * 2] = encodeSecondsTenthRaw(level.sec);
  });

  const pwmPowerPrimary = encodePercentRaw(draft.pwmPowerPercent);
  bytes[0x11] = pwmPowerPrimary;
  bytes[0x12] = pwmPowerPrimary;
  bytes[0x13] = pwmPowerPrimary;
  bytes[0x0f] = Math.max(0, pwmPowerPrimary - 20);

  if (draft.mode === "cr_mode") {
    bytes[0x36] = encodeSecondsTenthRaw(draft.proptlSeconds);
  }

  return bytes;
}

function configInfoFromRawBytes(rawBytes: Uint8Array, mode: CoreServoMode): ProbeConfigInfo {
  if (rawBytes.length !== CONFIG_BLOCK_SIZE) {
    throw new Error(`Expected ${CONFIG_BLOCK_SIZE} bytes, got ${rawBytes.length}.`);
  }

  const modelId = modelIdFromConfig(rawBytes);
  const model = findModel(loadCatalog(), modelId);
  const chunkSplit = 59;

  const hexDump = (bytes: Uint8Array): string =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");

  return {
    length: rawBytes.length,
    modelId,
    known: Boolean(model),
    modelName: model?.name ?? null,
    docsUrl: model?.docs_url ?? null,
    mode,
    modeLabel: servoModeLabel(mode),
    setup: summarizeConfig(rawBytes, modelId),
    rawHex: hexDump(rawBytes),
    firstChunk: hexDump(rawBytes.subarray(0, chunkSplit)),
    secondChunk: hexDump(rawBytes.subarray(chunkSplit)),
    rawBytes: Array.from(rawBytes),
  };
}

function lookupSpec(
  modelId: string | null,
  modelName: string | null,
  config: ProbeConfigInfo | null,
): ServoSpec {
  return lookupServoSpec(modelId, modelName, config?.setup?.rangeDegrees ?? null);
}

function peakEfficiencyLoadKgcm(spec: ServoSpec, voltage: number, pwmPowerPercent = 85): number {
  const base = interpolatePoint(spec.points, voltage);
  const torqueMax = Math.max(0.1, base.torqueKgcm * clamp(pwmPowerPercent / 100, 0.2, 1));
  const noLoadRpm = rpmFromSec60(base.speedSec60);
  let bestTorque = 0;
  let bestEfficiency = -1;

  for (let index = 0; index <= 48; index++) {
    const sampleTorque = (torqueMax * index) / 48;
    const sampleRatio = clamp(sampleTorque / torqueMax, 0, 1);
    const sampleCurrentA = base.idleA + (base.stallA - base.idleA) * sampleRatio;
    const sampleSpeedRpm = Math.max(0, noLoadRpm * (1 - sampleRatio));
    const sampleMechanicalPowerW = kgcmToNm(sampleTorque) * ((sampleSpeedRpm * 2 * Math.PI) / 60);
    const sampleElectricalPowerW = voltage * sampleCurrentA;
    const sampleEfficiency =
      sampleElectricalPowerW > 0 ? sampleMechanicalPowerW / sampleElectricalPowerW : 0;

    if (sampleEfficiency > bestEfficiency) {
      bestEfficiency = sampleEfficiency;
      bestTorque = sampleTorque;
    }
  }

  return Number(bestTorque.toFixed(1));
}

function maxAvailableTorqueKgcm(spec: ServoSpec, voltage: number, pwmPowerPercent = 85): number {
  const base = interpolatePoint(spec.points, voltage);
  return Math.max(0, base.torqueKgcm * clamp(pwmPowerPercent / 100, 0, 1));
}

function syncSimToDraft(
  draft: DraftConfig,
  sim: SimState,
  spec: ServoSpec,
  previousMode: ServoMode | null,
): SimState {
  const next = {
    ...sim,
    loadKgcm: clamp(
      sim.loadKgcm,
      0,
      maxAvailableTorqueKgcm(spec, sim.voltage, draft.pwmPowerPercent),
    ),
  };

  if (draft.mode === "servo_mode") {
    if (previousMode !== "servo_mode") {
      next.sweepEnabled = true;
      next.playbackRunning = true;
      next.servoSweepPhase = 0;
      next.crAngleDeg = 0;
      if (Math.abs(next.pwmUs - (1500 + draft.neutralUs)) < 50) {
        next.pwmUs = 1500;
      }
    }
  } else {
    if (previousMode !== "cr_mode") {
      next.sweepEnabled = false;
      next.playbackRunning = true;
      next.servoSweepPhase = 0;
      next.crAngleDeg = 0;
      next.loadKgcm = 0;
      if (Math.abs(next.pwmUs - (1500 + draft.neutralUs)) < 50) {
        next.pwmUs = 2000;
      }
    }
  }

  return next;
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function help(title: string): string {
  return `<button type="button" class="help" data-help="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">?</button>`;
}

function formatSignedUs(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function triangleWave(phase: number): number {
  const wrapped = phase % 2;
  return wrapped <= 1 ? wrapped : 2 - wrapped;
}

function scaleVoltagePoint(point: VoltagePoint, factor: number): VoltagePoint {
  return {
    voltage: point.voltage * factor,
    torqueKgcm: point.torqueKgcm * factor,
    speedSec60: factor <= 0.0001 ? Number.POSITIVE_INFINITY : point.speedSec60 / factor,
    idleA: point.idleA * factor,
    stallA: point.stallA * factor,
  };
}

function effectiveServoPwm(draft: DraftConfig, sim: SimState): number {
  if (draft.mode === "servo_mode" && sim.sweepEnabled) {
    return Math.round(500 + 2000 * triangleWave(sim.servoSweepPhase));
  }
  return sim.pwmUs;
}

function commandRatio(draft: DraftConfig, pwmUs: number): number {
  const centeredPwm = 1500 + draft.neutralUs;
  return clamp((pwmUs - centeredPwm) / 1000, -1, 1);
}

function buildOperatingPoint(
  config: ProbeConfigInfo | null,
  draft: DraftConfig,
  sim: SimState,
): {
  spec: ServoSpec;
  base: VoltagePoint;
  effective: VoltagePoint;
  point: OperatingPoint;
  curves: CurvePoint[];
  torqueMax: number;
  noLoadRpm: number;
} {
  const spec = lookupSpec(config?.modelId ?? null, config?.modelName ?? null, config);
  const base = interpolatePoint(spec.points, sim.voltage);
  const currentPwmUs = effectiveServoPwm(draft, sim);
  const servoCommand = commandRatio(draft, currentPwmUs);
  const powerFactor = clamp(draft.pwmPowerPercent / 100, 0, 1);
  const crDrive = commandRatio(draft, sim.pwmUs);
  const driveFactor = draft.mode === "cr_mode" ? Math.abs(crDrive) : 1;
  const signedCommand =
    (draft.mode === "cr_mode" ? crDrive : servoCommand) * (draft.direction === "cw" ? 1 : -1);
  const effective = scaleVoltagePoint(base, powerFactor * driveFactor);
  const noLoadRpm = rpmFromSec60(effective.speedSec60);
  const torqueMax = Math.max(0, effective.torqueKgcm);
  const rangeDeg = (spec.maxRangeDeg * draft.rangePercent) / 100;
  const minAngleDeg = -rangeDeg / 2;
  const maxAngleDeg = rangeDeg / 2;
  const commandMagnitude = Math.abs(signedCommand);
  const torqueKgcm = clamp(sim.loadKgcm, 0, Math.max(0.001, torqueMax));
  const torqueRatio = torqueMax <= 0.0001 ? 0 : clamp(torqueKgcm / torqueMax, 0, 1);
  const currentA =
    torqueMax <= 0.0001 ? 0 : effective.idleA + (effective.stallA - effective.idleA) * torqueRatio;
  const currentRpm = torqueMax <= 0.0001 ? 0 : Math.max(0, noLoadRpm * (1 - torqueRatio));
  const hornAngleDeg =
    draft.mode === "servo_mode"
      ? clamp(signedCommand * (rangeDeg / 2), minAngleDeg, maxAngleDeg)
      : commandMagnitude > 0.01
        ? sim.crAngleDeg
        : 0;
  const mechanicalPowerW = kgcmToNm(torqueKgcm) * ((currentRpm * 2 * Math.PI) / 60);
  const electricalPowerW = effective.voltage * currentA;
  const heatW = Math.max(0, electricalPowerW - mechanicalPowerW);
  const efficiency = electricalPowerW > 0 ? mechanicalPowerW / electricalPowerW : 0;

  const curves: CurvePoint[] = [];
  for (let index = 0; index <= 48; index++) {
    const sampleTorque = (torqueMax * index) / 48;
    const sampleRatio = torqueMax <= 0.0001 ? 0 : clamp(sampleTorque / torqueMax, 0, 1);
    const sampleCurrentA =
      torqueMax <= 0.0001
        ? 0
        : effective.idleA + (effective.stallA - effective.idleA) * sampleRatio;
    const sampleSpeedRpm = torqueMax <= 0.0001 ? 0 : Math.max(0, noLoadRpm * (1 - sampleRatio));
    const sampleMechanicalPowerW = kgcmToNm(sampleTorque) * ((sampleSpeedRpm * 2 * Math.PI) / 60);
    const sampleElectricalPowerW = effective.voltage * sampleCurrentA;
    const sampleHeatW = Math.max(0, sampleElectricalPowerW - sampleMechanicalPowerW);
    const sampleEfficiency =
      sampleElectricalPowerW > 0 ? sampleMechanicalPowerW / sampleElectricalPowerW : 0;

    curves.push({
      torqueKgcm: sampleTorque,
      speedRpm: sampleSpeedRpm,
      currentA: sampleCurrentA,
      mechanicalPowerW: sampleMechanicalPowerW,
      electricalPowerW: sampleElectricalPowerW,
      heatW: sampleHeatW,
      efficiency: sampleEfficiency,
    });
  }

  return {
    spec,
    base,
    effective,
    torqueMax,
    noLoadRpm,
    curves,
    point: {
      torqueKgcm,
      speedRpm: currentRpm,
      currentA,
      mechanicalPowerW,
      electricalPowerW,
      heatW,
      efficiency,
      pwmUs: currentPwmUs,
      hornAngleDeg,
      minAngleDeg,
      maxAngleDeg,
      effectiveVoltage: effective.voltage,
      commandMagnitude,
      commandSigned: signedCommand,
    },
  };
}

function formatOperatingTooltip(
  point: OperatingPoint,
  kind: "speed" | "current" | "power" | "efficiency",
): TooltipTableData {
  const rows: TooltipRow[] = [
    {
      label: "Torque",
      si: `${kgcmToNm(point.torqueKgcm).toFixed(2)} N*m`,
      imp: `${kgcmToOzIn(point.torqueKgcm).toFixed(1)} oz*in`,
      servo: `${point.torqueKgcm.toFixed(1)} kgf*cm`,
    },
    {
      label: "Speed",
      si: `${rpmToRadPerSec(point.speedRpm).toFixed(1)} rad/s`,
      imp: `${(point.speedRpm * 6).toFixed(0)} deg/s`,
      servo:
        point.speedRpm <= 0.001
          ? "stopped"
          : `${rpmToSecPer60Deg(point.speedRpm).toFixed(2)} s/60deg`,
    },
  ];

  if (kind === "speed" || kind === "current") {
    rows.push(
      {
        label: "Current",
        si: `${point.currentA.toFixed(2)} A`,
        imp: "—",
        servo: "—",
      },
      {
        label: "Elec. Power",
        si: `${point.electricalPowerW.toFixed(1)} W`,
        imp: "—",
        servo: "—",
      },
    );
  }

  if (kind === "power" || kind === "efficiency") {
    rows.push(
      {
        label: "Mech. Power",
        si: `${point.mechanicalPowerW.toFixed(1)} W`,
        imp: "—",
        servo: "—",
      },
      {
        label: "Elec. Power",
        si: `${point.electricalPowerW.toFixed(1)} W`,
        imp: "—",
        servo: "—",
      },
      {
        label: "Heat",
        si: `${point.heatW.toFixed(1)} W`,
        imp: "—",
        servo: "—",
      },
      {
        label: "Eff.",
        si: `${(point.efficiency * 100).toFixed(0)} %`,
        imp: "—",
        servo: "—",
      },
    );
  }

  return { rows };
}

function curveData(values: CurvePoint[], select: (value: CurvePoint) => number): ChartPoint[] {
  return values.map((value) => ({
    x: Number(value.torqueKgcm.toFixed(3)),
    y: Number(select(value).toFixed(6)),
  }));
}

function fullSpecChartBounds(
  spec: ServoSpec,
  voltage: number,
): {
  torqueMax: number;
  speedMax: number;
  currentMax: number;
  powerMax: number;
  efficiencyMax: number;
} {
  const sample = interpolatePoint(spec.points, voltage);
  const torqueMax = Math.max(0.1, sample.torqueKgcm);
  const speedMax = Math.max(1, rpmFromSec60(sample.speedSec60));
  const currentMax = Math.max(0.1, sample.stallA);
  const samplePowerMax =
    (kgcmToNm(sample.torqueKgcm / 2) * ((rpmFromSec60(sample.speedSec60) / 2) * 2 * Math.PI)) / 60;
  const sampleElectricalMax = sample.voltage * sample.stallA;
  const powerMax = Math.max(0.1, samplePowerMax, sampleElectricalMax);

  return {
    torqueMax,
    speedMax,
    currentMax,
    powerMax,
    efficiencyMax: 1,
  };
}

function formatAxisTick(
  value: string | number,
  kind: "torque" | "speed" | "current" | "power" | "efficiency",
): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  if (Math.abs(numeric) < 0.000001) return "0";
  switch (kind) {
    case "speed":
      return String(Math.round(numeric));
    case "torque":
      return Number(numeric.toFixed(1)).toFixed(1).replace(/\.0$/, "");
    case "current":
    case "power":
    case "efficiency":
      return numeric.toFixed(1);
  }
}

function createLineDataset(
  label: string,
  color: string,
  yAxisID: string,
  data: ChartPoint[],
  overrides: Partial<ChartDataset<"line", ChartPoint[]>> = {},
): ChartDataset<"line", ChartPoint[]> {
  return {
    label,
    data,
    yAxisID,
    parsing: false,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2.5,
    tension: 0.22,
    pointRadius: 0,
    pointHoverRadius: 0,
    ...overrides,
  };
}

function createPointDataset(
  label: string,
  color: string,
  yAxisID: string,
  point: ChartPoint,
  tooltipData: TooltipTableData,
): ChartDataset<"line", ChartPoint[]> {
  return {
    label,
    data: [point],
    yAxisID,
    parsing: false,
    borderColor: color,
    backgroundColor: "#8fc2f8",
    pointBorderColor: "#2d78d0",
    pointBackgroundColor: "#8fc2f8",
    pointBorderWidth: 0,
    pointRadius: 0,
    pointHoverRadius: 0,
    pointHitRadius: 12,
    pointStyle: "circle",
    showLine: false,
    clip: false,
    order: 99,
    operatingMarker: true,
    markerFill: "#8fc2f8",
    markerStroke: "#2d78d0",
    markerRadius: 6,
    tooltipData,
  } as ChartDataset<"line", ChartPoint[]>;
}

function ensureTooltipElement(_chart: Chart<"line", ChartPoint[]>): HTMLDivElement {
  let tooltipEl = document.body.querySelector<HTMLDivElement>(".chart-tooltip");
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "chart-tooltip";
    document.body.appendChild(tooltipEl);
  }

  return tooltipEl;
}

function ensureHelpTooltipElement(): HTMLDivElement {
  let tooltipEl = document.body.querySelector<HTMLDivElement>(".help-tooltip");
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "help-tooltip";
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function hideHelpTooltip(): void {
  const tooltipEl = document.body.querySelector<HTMLDivElement>(".help-tooltip");
  if (!tooltipEl) return;
  tooltipEl.style.opacity = "0";
  tooltipEl.style.pointerEvents = "none";
}

function showHelpTooltip(target: HTMLElement): void {
  const text = target.dataset.help?.trim();
  if (!text) return;
  const tooltipEl = ensureHelpTooltipElement();
  tooltipEl.textContent = text;
  tooltipEl.style.opacity = "1";
  tooltipEl.style.pointerEvents = "none";
  tooltipEl.style.left = "0px";
  tooltipEl.style.top = "0px";

  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltipEl.getBoundingClientRect();
  const margin = 12;
  const preferredLeft = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
  const preferredTop = targetRect.top - tooltipRect.height - 10;
  const maxLeft = window.innerWidth - tooltipRect.width - margin;
  const maxTop = window.innerHeight - tooltipRect.height - margin;

  const left = clamp(preferredLeft, margin, Math.max(margin, maxLeft));
  const top = clamp(preferredTop, margin, Math.max(margin, maxTop));

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function renderTooltipTable(data: TooltipTableData): string {
  return `
    <table class="chart-tooltip-table">
      <thead>
        <tr>
          <th></th>
          <th>SI</th>
          <th>Imp</th>
          <th>Servo</th>
        </tr>
      </thead>
      <tbody>
        ${data.rows
          .map(
            (row) => `
              <tr>
                <th>${escapeHtml(row.label)}</th>
                <td>${escapeHtml(row.si)}</td>
                <td>${escapeHtml(row.imp)}</td>
                <td>${escapeHtml(row.servo)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function externalTooltipHandler(context: {
  chart: Chart<"line", ChartPoint[]>;
  tooltip: TooltipModel<"line">;
}): void {
  const { chart, tooltip } = context;
  const tooltipEl = ensureTooltipElement(chart);

  if (tooltip.opacity === 0 || tooltip.dataPoints.length === 0) {
    tooltipEl.style.opacity = "0";
    tooltipEl.style.pointerEvents = "none";
    return;
  }

  const dataset = tooltip.dataPoints[0].dataset as ChartDataset<"line", ChartPoint[]> & {
    tooltipData?: TooltipTableData;
  };

  if (!dataset.tooltipData) {
    tooltipEl.style.opacity = "0";
    tooltipEl.style.pointerEvents = "none";
    return;
  }

  tooltipEl.innerHTML = renderTooltipTable(dataset.tooltipData);
  tooltipEl.style.opacity = "1";
  tooltipEl.style.pointerEvents = "none";
  tooltipEl.style.left = "0px";
  tooltipEl.style.top = "0px";

  const canvasRect = chart.canvas.getBoundingClientRect();
  const margin = 12;
  const tooltipRect = tooltipEl.getBoundingClientRect();
  const preferredLeft = canvasRect.left + tooltip.caretX - tooltipRect.width / 2;
  const preferredTop = canvasRect.top + tooltip.caretY - tooltipRect.height - 12;
  const maxLeft = window.innerWidth - tooltipRect.width - margin;
  const maxTop = window.innerHeight - tooltipRect.height - margin;

  const left = clamp(preferredLeft, margin, Math.max(margin, maxLeft));
  const top = clamp(preferredTop, margin, Math.max(margin, maxTop));

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function baseChartOptions(
  xMax: number,
  xTitle: string,
  yMax: number,
  yTitle: string,
  yKind: "speed" | "power" | "efficiency",
  y1Max?: number,
  y1Title?: string,
  hideSecondaryAxis = false,
): ChartOptions<"line"> {
  return {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "nearest",
      intersect: true,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
        external: externalTooltipHandler,
      },
    },
    scales: {
      x: {
        type: "linear",
        min: 0,
        max: xMax,
        grid: {
          color: "#e8edf3",
        },
        ticks: {
          color: "#9aa3af",
          maxTicksLimit: 5,
          callback(value) {
            return formatAxisTick(value, "torque");
          },
        },
        title: {
          display: true,
          text: xTitle,
          color: "#9aa3af",
        },
      },
      y: {
        type: "linear",
        min: 0,
        max: yMax,
        afterFit(scale) {
          scale.width = FIXED_LEFT_AXIS_WIDTH;
        },
        grid: {
          color: "#edf1f5",
        },
        ticks: {
          color: "#9aa3af",
          maxTicksLimit: 4,
          callback(value) {
            return formatAxisTick(value, yKind);
          },
        },
        title: {
          display: true,
          text: yTitle,
          color: "#9aa3af",
        },
      },
      ...(y1Max && y1Title
        ? {
            y1: {
              type: "linear",
              position: "right",
              min: 0,
              max: y1Max,
              afterFit(scale) {
                scale.width = FIXED_RIGHT_AXIS_WIDTH;
              },
              grid: {
                drawOnChartArea: false,
              },
              ticks: {
                color: hideSecondaryAxis ? "rgba(0,0,0,0)" : "#9aa3af",
                maxTicksLimit: 4,
                callback(value) {
                  return formatAxisTick(value, "current");
                },
              },
              title: {
                display: true,
                text: y1Title,
                color: hideSecondaryAxis ? "rgba(0,0,0,0)" : "#9aa3af",
              },
            },
          }
        : {}),
    },
  };
}

function syncChartGeometry(canvas: HTMLCanvasElement, chart: Chart<"line">): void {
  const area = chart.chartArea;
  if (!area) {
    return;
  }
  const xTitle = chart.options.scales?.x?.title?.text;
  canvas.dataset.xTitle = typeof xTitle === "string" ? xTitle : "";
  canvas.dataset.plotLeft = area.left.toFixed(1);
  canvas.dataset.plotRight = area.right.toFixed(1);
  canvas.dataset.plotTop = area.top.toFixed(1);
  canvas.dataset.plotBottom = area.bottom.toFixed(1);
}

function simChartsMarkup(): string {
  return `
    <div class="chart-card">
      <div class="chart-canvas-wrap">
        <canvas data-chart="speed-current" aria-label="speed and current chart"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-canvas-wrap">
        <canvas data-chart="power" aria-label="mechanical power chart"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-canvas-wrap">
        <canvas data-chart="efficiency" aria-label="efficiency chart"></canvas>
      </div>
    </div>
  `;
}

function sweepControlIcon(enabled: boolean): string {
  return enabled
    ? `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
      </svg>
    `
    : `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.5L19 12L8 18.5V5.5Z" fill="currentColor" />
      </svg>
    `;
}

function servoSketch(
  spec: ServoSpec,
  point: OperatingPoint,
  draft: DraftConfig,
  torqueMax: number,
): string {
  const width = 430;
  const height = 390;
  const bodyX = 168;
  const bodyY = 118;
  const axisX = bodyX + spec.bodyWidth / 2;
  const axisY = bodyY + spec.axisInsetY;
  const armLength = Math.round(spec.bodyWidth * 0.78);
  const sweepRadius = armLength + 14;
  const arrowRadius = sweepRadius + 34;
  const arcStartDeg = -74;
  const arcEndDeg = 74;
  const pointAt = (degrees: number, radius: number): { x: number; y: number } => ({
    x: axisX + Math.sin((degrees * Math.PI) / 180) * radius,
    y: axisY - Math.cos((degrees * Math.PI) / 180) * radius,
  });
  const arrowStart = pointAt(draft.direction === "cw" ? arcStartDeg : arcEndDeg, arrowRadius);
  const arrowEnd = pointAt(draft.direction === "cw" ? arcEndDeg : arcStartDeg, arrowRadius);
  const directionArc = `M ${arrowStart.x.toFixed(1)} ${arrowStart.y.toFixed(1)} A ${arrowRadius} ${arrowRadius} 0 0 ${draft.direction === "cw" ? "1" : "0"} ${arrowEnd.x.toFixed(1)} ${arrowEnd.y.toFixed(1)}`;
  const markerRadius = arrowRadius;
  const minLineEndX = axisX + Math.sin((point.minAngleDeg * Math.PI) / 180) * markerRadius;
  const minLineEndY = axisY - Math.cos((point.minAngleDeg * Math.PI) / 180) * markerRadius;
  const maxLineEndX = axisX + Math.sin((point.maxAngleDeg * Math.PI) / 180) * markerRadius;
  const maxLineEndY = axisY - Math.cos((point.maxAngleDeg * Math.PI) / 180) * markerRadius;
  const hornEndX = axisX + Math.sin((point.hornAngleDeg * Math.PI) / 180) * armLength;
  const hornEndY = axisY - Math.cos((point.hornAngleDeg * Math.PI) / 180) * armLength;
  const readout =
    draft.mode === "servo_mode"
      ? `${point.hornAngleDeg.toFixed(0)} deg`
      : `${point.speedRpm.toFixed(0)} rpm`;
  const rpmBadge =
    draft.mode === "cr_mode"
      ? {
          label: readout,
          fill: "#e4f0ff",
          stroke: "#2d78d0",
          text: "#1f5fa8",
        }
      : null;
  const loadRatio = torqueMax <= 0.0001 ? 0 : clamp(point.torqueKgcm / torqueMax, 0, 1);
  const loadBadge =
    draft.mode === "cr_mode"
      ? loadRatio >= 0.95
        ? {
            label: "stalled",
            fill: "#fbe4e6",
            stroke: "#c81e1e",
            text: "#a61b1b",
          }
        : loadRatio >= 0.85
          ? {
              label: "near stall",
              fill: "#fff6d8",
              stroke: "#d4a514",
              text: "#8f6a00",
            }
          : loadRatio <= 0.01
            ? {
                label: "no load",
                fill: "#e4f0ff",
                stroke: "#2d78d0",
                text: "#1f5fa8",
              }
            : {
                label: "loaded",
                fill: "#e4f0ff",
                stroke: "#2d78d0",
                text: "#1f5fa8",
              }
      : null;
  const bodyBottomY = bodyY + spec.bodyHeight;
  const badgeGap = 10;
  const badgeHeight = 24;
  const rpmBadgeWidth = rpmBadge ? Math.max(86, 18 + rpmBadge.label.length * 7.4) : 0;
  const loadBadgeWidth = loadBadge ? Math.max(72, 18 + loadBadge.label.length * 7.2) : 0;
  const loadBadgeX = axisX - loadBadgeWidth / 2;
  const rpmBadgeX = axisX - rpmBadgeWidth / 2;
  const loadBadgeY = bodyBottomY - badgeGap - badgeHeight;
  const rpmBadgeY =
    loadBadge && rpmBadge
      ? loadBadgeY - badgeGap - badgeHeight
      : bodyBottomY - badgeGap - badgeHeight;
  const centerColor =
    draft.mode === "cr_mode"
      ? point.commandMagnitude > 0.01
        ? point.commandSigned >= 0
          ? "#25a244"
          : "#ff3a38"
        : "#6b7280"
      : draft.direction === "cw"
        ? "#25a244"
        : "#ff3a38";

  return `
    <svg
      viewBox="0 0 ${width} ${height}"
      class="servo-svg"
      aria-label="servo operating sketch"
      data-load-state="${escapeHtml(loadBadge?.label ?? "")}"
    >
      <defs>
        <marker id="dir-head" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#b9bbc0" />
        </marker>
      </defs>
      <path d="${directionArc}" fill="none" stroke="#b9bbc0" stroke-width="4" stroke-linecap="round" marker-end="url(#dir-head)" />
      <rect x="${bodyX}" y="${bodyY}" width="${spec.bodyWidth}" height="${spec.bodyHeight}" rx="28" ry="28" fill="#ffffff" stroke="#111111" stroke-width="2" />
      <circle cx="${axisX}" cy="${axisY}" r="17" fill="#ffffff" stroke="#111111" stroke-width="2" />
      ${
        draft.mode === "servo_mode"
          ? `
            <line x1="${axisX}" y1="${axisY}" x2="${minLineEndX.toFixed(1)}" y2="${minLineEndY.toFixed(1)}" stroke="#25a244" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 14" />
            <line x1="${axisX}" y1="${axisY}" x2="${maxLineEndX.toFixed(1)}" y2="${maxLineEndY.toFixed(1)}" stroke="#ff3a38" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 14" />
          `
          : ""
      }
      <line x1="${axisX}" y1="${axisY}" x2="${hornEndX.toFixed(1)}" y2="${hornEndY.toFixed(1)}" stroke="#1f6ed4" stroke-width="8" stroke-linecap="round" />
      <circle cx="${axisX}" cy="${axisY}" r="5" fill="${centerColor}" />
      ${
        draft.mode === "servo_mode"
          ? `<text x="${axisX}" y="${axisY + 36}" text-anchor="middle" fill="#7eb4f5" font-size="15" font-weight="700">${readout}</text>`
          : ""
      }
      ${
        rpmBadge
          ? `
            <rect
              x="${rpmBadgeX.toFixed(1)}"
              y="${rpmBadgeY.toFixed(1)}"
              width="${rpmBadgeWidth.toFixed(1)}"
              height="${badgeHeight}"
              rx="12"
              ry="12"
              fill="${rpmBadge.fill}"
              stroke="${rpmBadge.stroke}"
              stroke-width="1.5"
            />
            <text
              x="${axisX}"
              y="${(rpmBadgeY + 16).toFixed(1)}"
              text-anchor="middle"
              fill="${rpmBadge.text}"
              font-size="12"
              font-weight="700"
            >${rpmBadge.label}</text>
          `
          : ""
      }
      ${
        loadBadge
          ? `
            <rect
              x="${loadBadgeX.toFixed(1)}"
              y="${loadBadgeY.toFixed(1)}"
              width="${loadBadgeWidth.toFixed(1)}"
              height="${badgeHeight}"
              rx="12"
              ry="12"
              fill="${loadBadge.fill}"
              stroke="${loadBadge.stroke}"
              stroke-width="1.5"
            />
            <text
              x="${axisX}"
              y="${(loadBadgeY + 16).toFixed(1)}"
              text-anchor="middle"
              fill="${loadBadge.text}"
              font-size="12"
              font-weight="700"
            >${loadBadge.label}</text>
          `
          : ""
      }
    </svg>
  `;
}

export function mountProbeApp(options: MountProbeAppOptions): void {
  const initialDraft = baseDraft();
  const state: ProbeState = {
    environment: null,
    inventory: { devices: [], openedId: null },
    identify: null,
    config: null,
    lastKnownModelId: null,
    lastKnownModelName: null,
    draft: initialDraft,
    baselineRawBytes: null,
    liveSnapshot: null,
    checkpoints: readStoredCheckpoints(),
    sim: baseSim(initialDraft),
    busyAction: null,
    applyProgress: null,
    error: null,
    logs: [],
    statusMessage: "Starting",
    statusOpen: false,
    loadPanelOpen: false,
    recoveryConfirmOpen: false,
    recoverySource: "bundled",
    recoveryBundledModelId: "",
    recoveryBundledMode: "servo_mode",
    recoveryFile: null,
    recoveryFileModelId: null,
    recoveryFileModelName: null,
    hasAuthorizedAccess: options.initialAuthorizedAccess ?? false,
    diagnosticsOpen: false,
  };

  let sweepFrame: number | null = null;
  let lastSweepFrameTs: number | null = null;
  let livePollTimer: ReturnType<typeof setInterval> | null = null;
  let _transportLogCleanup: undefined | (() => void);
  let _statusLogCleanup: undefined | (() => void);
  let liveProbeInFlight = false;
  let missingServoStreak = 0;
  let probeFailureStreak = 0;
  let lastSilentError: string | null = null;
  let charts: ProbeCharts | null = null;
  let resizeQuietUntil = 0;
  let resizeEndTimer: ReturnType<typeof setTimeout> | null = null;
  let statusLogScrollTop = 0;
  let statusLogPinnedToBottom = true;
  const logger = {
    push(level: "status" | "debug", message: string): void {
      state.logs.push({ timestamp: nowLabel(), message, level });
      if (state.logs.length > 64) {
        state.logs = state.logs.slice(-64);
      }
    },
    status(message: string): void {
      this.push("status", message);
    },
    debug(message: string): void {
      if (!options.debugEnabled) return;
      this.push("debug", message);
    },
    snapshot(): string {
      return [...state.logs]
        .map(
          (entry) =>
            `[${entry.timestamp}]${entry.level === "debug" ? "[debug]" : ""} ${entry.message}`,
        )
        .join("\n");
    },
  };

  function setStatus(message: string, shouldLog = true): void {
    if (state.statusMessage === message) return;
    state.statusMessage = message;
    if (shouldLog) {
      logger.status(message);
    }
  }

  function idleStatus(): string {
    if (state.inventory.openedId === null) {
      return state.hasAuthorizedAccess ? "Waiting for adapter" : "Request USB permission";
    }
    if (!(state.identify?.present ?? Boolean(state.config))) {
      return "Checking for servo";
    }
    return "Ready";
  }

  function setIdleStatus(shouldLog = true): void {
    setStatus(idleStatus(), shouldLog);
  }

  function reportError(error: unknown, statusMessage = "Error"): string {
    const message = error instanceof Error ? error.message : String(error);
    state.error = message;
    logger.status(`Error: ${message}`);
    state.statusMessage = statusMessage;
    return message;
  }

  function setApplyProgress(title: string, detail: string, percent: number): void {
    state.applyProgress = {
      title,
      detail,
      percent: clamp(percent, 0, 100),
    };
  }

  function clearApplyProgress(): void {
    state.applyProgress = null;
  }

  function flashPhaseProgress(
    targetMode: ServoMode,
    event: ProbeFlashProgressEvent,
  ): { title: string; detail: string; percent: number } {
    const modeLabelText = targetMode === "cr_mode" ? "CR" : "Servo";
    switch (event.phase) {
      case "prepare":
        return {
          title: "Applying Changes...",
          detail: `Switching to ${modeLabelText}: preparing flash session`,
          percent: 10,
        };
      case "boot_query":
        return {
          title: "Applying Changes...",
          detail: `Switching to ${modeLabelText}: checking bootloader`,
          percent: 18,
        };
      case "key_exchange":
        return {
          title: "Applying Changes...",
          detail: `Switching to ${modeLabelText}: negotiating flash session`,
          percent: 26,
        };
      case "verify_model":
        return {
          title: "Applying Changes...",
          detail: `Switching to ${modeLabelText}: verifying firmware`,
          percent: 32,
        };
      case "erase":
        return {
          title: "Applying Changes...",
          detail: `Switching to ${modeLabelText}: erasing firmware sectors`,
          percent: 40,
        };
      case "write": {
        const ratio =
          typeof event.bytesSent === "number" &&
          typeof event.bytesTotal === "number" &&
          event.bytesTotal > 0
            ? event.bytesSent / event.bytesTotal
            : 0;
        return {
          title: "Applying Changes...",
          detail: `Switching to ${modeLabelText}: writing firmware`,
          percent: 45 + ratio * 35,
        };
      }
      case "finalize":
        return {
          title: "Applying Changes...",
          detail: `Switching to ${modeLabelText}: finalizing firmware`,
          percent: 82,
        };
      case "done":
        return {
          title: "Applying Changes...",
          detail: `Switching to ${modeLabelText}: reconnecting servo`,
          percent: 86,
        };
      default:
        return {
          title: "Applying Changes...",
          detail: `Switching to ${modeLabelText}`,
          percent: 25,
        };
    }
  }

  function recoveryPhaseProgress(
    modelLabel: string,
    event: ProbeFlashProgressEvent,
  ): { title: string; detail: string; percent: number } {
    switch (event.phase) {
      case "prepare":
        return {
          title: "Recovering Servo...",
          detail: `Recovering ${modelLabel}: preparing flash session`,
          percent: 10,
        };
      case "boot_query":
        return {
          title: "Recovering Servo...",
          detail: `Recovering ${modelLabel}: checking bootloader`,
          percent: 18,
        };
      case "key_exchange":
        return {
          title: "Recovering Servo...",
          detail: `Recovering ${modelLabel}: negotiating flash session`,
          percent: 26,
        };
      case "verify_model":
        return {
          title: "Recovering Servo...",
          detail: `Recovering ${modelLabel}: verifying firmware`,
          percent: 32,
        };
      case "erase":
        return {
          title: "Recovering Servo...",
          detail: `Recovering ${modelLabel}: erasing firmware sectors`,
          percent: 40,
        };
      case "write": {
        const ratio =
          typeof event.bytesSent === "number" &&
          typeof event.bytesTotal === "number" &&
          event.bytesTotal > 0
            ? event.bytesSent / event.bytesTotal
            : 0;
        return {
          title: "Recovering Servo...",
          detail: `Recovering ${modelLabel}: writing firmware`,
          percent: 45 + ratio * 35,
        };
      }
      case "finalize":
        return {
          title: "Recovering Servo...",
          detail: `Recovering ${modelLabel}: finalizing firmware`,
          percent: 82,
        };
      case "done":
        return {
          title: "Recovering Servo...",
          detail: `Recovering ${modelLabel}: reconnecting servo`,
          percent: 86,
        };
      default:
        return {
          title: "Recovering Servo...",
          detail: `Recovering ${modelLabel}`,
          percent: 25,
        };
    }
  }

  function inventorySignature(inventory: ProbeInventory): string {
    return JSON.stringify({
      openedId: inventory.openedId,
      devices: inventory.devices.map((device) => ({
        id: device.id,
        opened: device.opened,
      })),
    });
  }

  function updateInventory(inventory: ProbeInventory): boolean {
    const previousDevices = state.inventory.devices.length;
    const previousOpenedId = state.inventory.openedId;
    const changed = inventorySignature(state.inventory) !== inventorySignature(inventory);
    let clearedLiveState = false;
    state.inventory = inventory;
    if (inventory.devices.length > 0 || inventory.openedId !== null) {
      state.hasAuthorizedAccess = true;
    }
    if (!inventory.openedId && state.busyAction !== "Apply" && state.busyAction !== "Recover") {
      clearedLiveState = state.identify !== null || state.config !== null;
      state.identify = null;
      state.config = null;
      state.liveSnapshot = null;
      missingServoStreak = 0;
      probeFailureStreak = 0;
      lastSilentError = null;
    }
    if (changed) {
      if (previousDevices === 0 && inventory.devices.length > 0) {
        logger.debug("Adapter visible");
      }
      if (previousDevices > 0 && inventory.devices.length === 0) {
        logger.debug("Adapter not visible");
      }
      if (previousOpenedId === null && inventory.openedId !== null) {
        logger.debug("Adapter connected");
      }
      if (previousOpenedId !== null && inventory.openedId === null) {
        logger.debug("Adapter disconnected");
      }
    }
    updateSweepTimer();
    if (!state.busyAction) {
      setIdleStatus(changed || clearedLiveState);
    }
    return changed || clearedLiveState;
  }

  function rememberCheckpoint(config: ProbeConfigInfo, draft: DraftConfig): void {
    const createdAt = new Date().toISOString();
    const checkpoint: ConfigCheckpoint = {
      id: checkpointLabel(config, createdAt),
      createdAt,
      label: checkpointLabel(config, createdAt),
      modelId: config.modelId,
      modelName: config.modelName,
      draft: cloneDraftConfig(draft),
    };
    if (
      state.checkpoints[0] &&
      draftKey(state.checkpoints[0].draft) === draftKey(checkpoint.draft)
    ) {
      return;
    }
    state.checkpoints = [checkpoint, ...state.checkpoints].slice(0, MAX_CHECKPOINTS);
    writeStoredCheckpoints(state.checkpoints);
  }

  function adoptDraft(nextDraft: DraftConfig, previousMode: ServoMode | null): void {
    state.draft = cloneDraftConfig(nextDraft);
    state.sim = syncSimToDraft(
      state.draft,
      state.sim,
      lookupSpec(state.config?.modelId ?? null, state.config?.modelName ?? null, state.config),
      previousMode,
    );
    updateSweepTimer();
  }

  function applyConfig(config: ProbeConfigInfo): void {
    const previousMode = state.draft.mode;
    state.config = config;
    state.lastKnownModelId = config.modelId;
    state.lastKnownModelName = config.modelName;
    state.identify = {
      present: true,
      statusHi: "0x01",
      statusLo: "0x00",
      modeByte: null,
      mode: config.mode,
      rawRx: state.identify?.rawRx ?? "",
    };
    const nextDraft = draftFromConfig(config, state.draft);
    state.liveSnapshot = cloneDraftConfig(nextDraft);
    state.baselineRawBytes = config.rawBytes ? [...config.rawBytes] : null;
    rememberCheckpoint(config, nextDraft);
    adoptDraft(nextDraft, previousMode);
  }

  function openRecoveryWizard(): void {
    const preferred = recoveryTargetFromState(state);
    state.recoverySource = "bundled";
    state.recoveryBundledModelId =
      preferred?.modelId || state.recoveryBundledModelId || RECOVERY_MODELS[0]?.id || "";
    state.recoveryBundledMode = "servo_mode";
    state.recoveryConfirmOpen = true;
  }

  async function promptRecoveryFirmware(): Promise<void> {
    if (!options.loadFirmwareFile) {
      return;
    }
    try {
      const file = await options.loadFirmwareFile.run();
      if (!file) {
        return;
      }
      const parsed = parseRecoveryFirmwareFile(file);
      state.recoverySource = "file";
      state.recoveryFile = file;
      state.recoveryFileModelId = parsed.modelId;
      state.recoveryFileModelName = parsed.modelName;
      state.error = null;
      render();
    } catch (error) {
      reportError(error);
      render();
    }
  }

  async function reconnectAndReadServoAfterFlash(
    expectedMode: ServoMode | null,
    progressTitle: string,
  ): Promise<ProbeConfigInfo> {
    if (!options.readFullConfig) {
      throw new Error("Read setup is not available after flash.");
    }

    let flashedConfig: ProbeConfigInfo | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(1000);
      try {
        if (options.reconnectDevice) {
          updateInventory(await options.reconnectDevice.run());
        }
        if (!state.inventory.openedId && options.openDevice) {
          updateInventory(await options.openDevice.run());
        }
        if (options.identifyServo) {
          setApplyProgress(progressTitle, "Waiting for servo to reconnect", 88);
          setStatus("Checking for servo", attempt === 0);
          const identifyReply = await options.identifyServo.run();
          state.identify = identifyReply;
          if (!identifyReply.present) {
            continue;
          }
        }
        setApplyProgress(progressTitle, "Reading reconnected servo setup", 92);
        setStatus("Reading setup", false);
        const candidate = await options.readFullConfig.run();
        if (expectedMode !== null && modeFromConfig(candidate) !== expectedMode) {
          continue;
        }
        flashedConfig = candidate;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!flashedConfig) {
      if (lastError instanceof Error) throw lastError;
      throw new Error("Servo did not reconnect in the requested mode after flash.");
    }
    return flashedConfig;
  }

  async function discardToServo(): Promise<void> {
    if (state.busyAction || !options.readFullConfig || !state.config) return;

    state.busyAction = "Discard";
    state.error = null;
    state.loadPanelOpen = false;
    setStatus("Reloading setup");
    render();

    try {
      if (options.identifyServo) {
        setStatus("Checking for servo", false);
        const identifyReply = await options.identifyServo.run();
        state.identify = identifyReply;
        if (!identifyReply.present) {
          throw new Error("Servo not detected.");
        }
      }

      setStatus("Reading setup", false);
      const config = await options.readFullConfig.run();
      applyConfig(config);
      setStatus("Discarded edits");
      setIdleStatus();
    } catch (error) {
      reportError(error);
    } finally {
      state.busyAction = null;
      render();
    }
  }

  async function applyToServo(): Promise<void> {
    if (
      state.busyAction ||
      !state.config ||
      !state.liveSnapshot ||
      !options.readFullConfig ||
      !options.writeFullConfig
    ) {
      return;
    }

    state.busyAction = "Apply";
    state.error = null;
    setApplyProgress("Applying Changes...", "Reading current servo setup", 10);
    setStatus("Reading setup");
    render();

    try {
      if (options.identifyServo) {
        const identifyReply = await options.identifyServo.run();
        state.identify = identifyReply;
        if (!identifyReply.present) {
          throw new Error("Servo not detected.");
        }
      }

      const liveConfig = await options.readFullConfig.run();
      let workingConfig = liveConfig;
      let workingMode = modeFromConfig(workingConfig);

      if (workingMode !== state.draft.mode) {
        if (!options.flashModeChange) {
          throw new Error("Apply for mode changes is not wired here yet.");
        }
        setApplyProgress(
          "Applying Changes...",
          `Switching to ${state.draft.mode === "cr_mode" ? "CR" : "Servo"}`,
          8,
        );
        setStatus("Flashing mode");
        await options.flashModeChange.run({
          targetMode: state.draft.mode,
          modelId: workingConfig.modelId,
          onProgress: (event) => {
            const progress = flashPhaseProgress(state.draft.mode, event);
            setApplyProgress(progress.title, progress.detail, progress.percent);
            render();
          },
        });

        workingConfig = await reconnectAndReadServoAfterFlash(
          state.draft.mode,
          "Applying Changes...",
        );
        workingMode = modeFromConfig(workingConfig);
      }

      if (workingMode !== state.draft.mode) {
        throw new Error("Servo mode did not match the requested draft after reconnect.");
      }
      if (!workingConfig.rawBytes) {
        throw new Error("No raw config block is available for apply.");
      }

      const targetBytes = encodeDraftOntoRawConfig(
        Uint8Array.from(workingConfig.rawBytes),
        state.draft,
      );
      const workingBytes = Uint8Array.from(workingConfig.rawBytes);
      if (sameBytes(targetBytes, workingBytes)) {
        applyConfig(workingConfig);
        clearApplyProgress();
        setStatus("No changes to apply");
        setIdleStatus();
        return;
      }

      setApplyProgress(
        "Applying Changes...",
        "Writing setup",
        workingMode === state.draft.mode && modeFromConfig(liveConfig) === state.draft.mode
          ? 70
          : 95,
      );
      setStatus("Writing setup");
      await options.writeFullConfig.run(targetBytes);

      setApplyProgress(
        "Applying Changes...",
        "Verifying applied setup",
        workingMode === state.draft.mode && modeFromConfig(liveConfig) === state.draft.mode
          ? 90
          : 98,
      );
      setStatus("Verifying");
      const verifiedConfig = await options.readFullConfig.run();
      if (!verifiedConfig.rawBytes) {
        throw new Error("Verification read did not return a raw config block.");
      }
      const verifiedBytes = Uint8Array.from(verifiedConfig.rawBytes);
      if (!sameBytes(targetBytes, verifiedBytes)) {
        throw new Error("Write verification failed. The servo read-back does not match the draft.");
      }

      applyConfig(verifiedConfig);
      setApplyProgress("Applying Changes...", "Finishing", 100);
      setStatus("Applied");
      setIdleStatus();
    } catch (error) {
      reportError(error);
      try {
        if (options.readFullConfig && state.inventory.openedId !== null) {
          const refreshed = await options.readFullConfig.run();
          applyConfig(refreshed);
        }
      } catch {
        // keep the current draft and surface the original error
      }
    } finally {
      clearApplyProgress();
      state.busyAction = null;
      render();
    }
  }

  async function recoverServo(): Promise<void> {
    if (
      state.busyAction ||
      !options.readFullConfig ||
      (state.recoverySource === "bundled" && !options.flashModeChange) ||
      (state.recoverySource === "file" && !options.flashFirmwareFile)
    ) {
      return;
    }

    const bundledModel =
      state.recoverySource === "bundled"
        ? findModel(loadCatalog(), state.recoveryBundledModelId)
        : undefined;
    const bundledTarget =
      state.recoverySource === "bundled" && bundledModel
        ? {
            modelId: bundledModel.id,
            modelName: bundledModel.name,
            mode: state.recoveryBundledMode,
          }
        : null;
    const fileTarget =
      state.recoverySource === "file" && state.recoveryFile
        ? {
            file: state.recoveryFile,
            modelId: state.recoveryFileModelId,
            modelName: state.recoveryFileModelName,
          }
        : null;

    if (!bundledTarget && !fileTarget) {
      return;
    }

    const recoveryLabel = shortModelLabel(
      bundledTarget?.modelName ?? fileTarget?.modelName ?? fileTarget?.modelId ?? null,
    );
    const expectedMode = bundledTarget?.mode ?? null;
    state.busyAction = "Recover";
    state.recoveryConfirmOpen = false;
    state.error = null;
    setApplyProgress(
      "Recovering Servo...",
      `Recovering ${recoveryLabel}: preparing flash session`,
      8,
    );
    setStatus("Flashing recovery firmware");
    render();

    try {
      if (bundledTarget) {
        if (!options.flashModeChange) {
          throw new Error("Bundled recovery flashing is not available here.");
        }
        await options.flashModeChange.run({
          targetMode: bundledTarget.mode,
          modelId: bundledTarget.modelId,
          onProgress: (event) => {
            const progress = recoveryPhaseProgress(recoveryLabel, event);
            setApplyProgress(progress.title, progress.detail, progress.percent);
            render();
          },
        });
      } else if (fileTarget) {
        if (!options.flashFirmwareFile) {
          throw new Error("Custom firmware recovery flashing is not available here.");
        }
        await options.flashFirmwareFile.run({
          bytes: Uint8Array.from(fileTarget.file.bytes),
          expectedModelId: fileTarget.modelId ?? undefined,
          onProgress: (event) => {
            const progress = recoveryPhaseProgress(recoveryLabel, event);
            setApplyProgress(progress.title, progress.detail, progress.percent);
            render();
          },
        });
      }

      const recoveredConfig = await reconnectAndReadServoAfterFlash(
        expectedMode,
        "Recovering Servo...",
      );
      applyConfig(recoveredConfig);
      setApplyProgress("Recovering Servo...", "Finishing", 100);
      setStatus("Recovered");
      setIdleStatus();
    } catch (error) {
      reportError(error);
      try {
        if (options.readFullConfig && state.inventory.openedId !== null) {
          const refreshed = await options.readFullConfig.run();
          applyConfig(refreshed);
        }
      } catch {
        // keep the current state and surface the original error
      }
    } finally {
      clearApplyProgress();
      state.busyAction = null;
      render();
    }
  }

  function loadCheckpoint(checkpointId: string): void {
    const checkpoint = state.checkpoints.find((entry) => entry.id === checkpointId);
    if (!checkpoint) return;
    const previousMode = state.draft.mode;
    adoptDraft(cloneDraftConfig(checkpoint.draft), previousMode);
    state.error = null;
    state.loadPanelOpen = false;
    setStatus(`Loaded ${checkpoint.label}`);
    setIdleStatus();
    render();
  }

  function destroyCharts(): void {
    charts?.speedCurrent.destroy();
    charts?.power.destroy();
    charts?.efficiency.destroy();
    charts = null;
  }

  function ensureCharts(operating: ReturnType<typeof buildOperatingPoint>): void {
    const speedCanvas = options.root.querySelector<HTMLCanvasElement>(
      "[data-chart='speed-current']",
    );
    const powerCanvas = options.root.querySelector<HTMLCanvasElement>("[data-chart='power']");
    const efficiencyCanvas = options.root.querySelector<HTMLCanvasElement>(
      "[data-chart='efficiency']",
    );

    if (!speedCanvas || !powerCanvas || !efficiencyCanvas) {
      destroyCharts();
      return;
    }

    const bounds = fullSpecChartBounds(operating.spec, state.sim.voltage);
    const xMax = Math.max(
      0.1,
      ...operating.curves.map((curve) => curve.torqueKgcm),
      operating.point.torqueKgcm,
    );
    const speedMax = bounds.speedMax;
    const currentMax = bounds.currentMax;
    const powerMax = bounds.powerMax;
    const efficiencyMax = bounds.efficiencyMax;

    const speedData = curveData(operating.curves, (curve) => curve.speedRpm);
    const currentData = curveData(operating.curves, (curve) => curve.currentA);
    const mechanicalPowerData = curveData(operating.curves, (curve) => curve.mechanicalPowerW);
    const totalPowerData = curveData(operating.curves, (curve) => curve.electricalPowerW);
    const efficiencyData = curveData(operating.curves, (curve) => curve.efficiency);

    const speedPoint = {
      x: Number(operating.point.torqueKgcm.toFixed(3)),
      y: Number(operating.point.speedRpm.toFixed(6)),
    };
    const currentPoint = {
      x: Number(operating.point.torqueKgcm.toFixed(3)),
      y: Number(operating.point.currentA.toFixed(6)),
    };
    const powerPoint = {
      x: Number(operating.point.torqueKgcm.toFixed(3)),
      y: Number(operating.point.mechanicalPowerW.toFixed(6)),
    };
    const efficiencyPoint = {
      x: Number(operating.point.torqueKgcm.toFixed(3)),
      y: Number(operating.point.efficiency.toFixed(6)),
    };
    const xAxisTitle = `torque @ ${state.sim.voltage.toFixed(1)} V (kgf*cm)`;

    if (!charts) {
      charts = {
        speedCurrent: new Chart(speedCanvas, {
          type: "line",
          data: {
            datasets: [
              createLineDataset("Speed", "#111111", "y", speedData),
              createLineDataset("Current", "#ff3a38", "y1", currentData),
              createPointDataset(
                "Operating speed",
                "#2d78d0",
                "y",
                speedPoint,
                formatOperatingTooltip(operating.point, "speed"),
              ),
              createPointDataset(
                "Operating current",
                "#2d78d0",
                "y1",
                currentPoint,
                formatOperatingTooltip(operating.point, "current"),
              ),
            ],
          },
          options: baseChartOptions(
            xMax,
            xAxisTitle,
            speedMax,
            "speed (rpm)",
            "speed",
            currentMax,
            "current (A)",
          ),
        }),
        power: new Chart(powerCanvas, {
          type: "line",
          data: {
            datasets: [
              createLineDataset("Mechanical power", "#8fc2f8", "y", mechanicalPowerData, {
                fill: "origin",
                backgroundColor: "rgba(143,194,248,0.35)",
              }),
              createLineDataset("Total input power", "#f0c57a", "y", totalPowerData, {
                fill: "-1",
                backgroundColor: "rgba(240,197,122,0.32)",
                borderColor: "#f0c57a",
                borderWidth: 2.2,
              }),
              createPointDataset(
                "Operating power",
                "#2d78d0",
                "y",
                powerPoint,
                formatOperatingTooltip(operating.point, "power"),
              ),
            ],
          },
          options: baseChartOptions(
            xMax,
            xAxisTitle,
            powerMax,
            "power (W)",
            "power",
            currentMax,
            "current (A)",
            true,
          ),
        }),
        efficiency: new Chart(efficiencyCanvas, {
          type: "line",
          data: {
            datasets: [
              createLineDataset("Efficiency", "#f0c57a", "y", efficiencyData),
              createPointDataset(
                "Operating efficiency",
                "#2d78d0",
                "y",
                efficiencyPoint,
                formatOperatingTooltip(operating.point, "efficiency"),
              ),
            ],
          },
          options: baseChartOptions(
            xMax,
            xAxisTitle,
            efficiencyMax,
            "efficiency",
            "efficiency",
            currentMax,
            "current (A)",
            true,
          ),
        }),
      };
    }

    charts.speedCurrent.data.datasets[0].data = speedData;
    charts.speedCurrent.data.datasets[1].data = currentData;
    charts.speedCurrent.data.datasets[2].data = [speedPoint];
    charts.speedCurrent.data.datasets[3].data = [currentPoint];
    (
      charts.speedCurrent.data.datasets[2] as ChartDataset<"line", ChartPoint[]> & {
        tooltipData?: TooltipTableData;
      }
    ).tooltipData = formatOperatingTooltip(operating.point, "speed");
    (
      charts.speedCurrent.data.datasets[3] as ChartDataset<"line", ChartPoint[]> & {
        tooltipData?: TooltipTableData;
      }
    ).tooltipData = formatOperatingTooltip(operating.point, "current");
    charts.speedCurrent.options.scales = {
      ...(charts.speedCurrent.options.scales ?? {}),
      x: {
        ...(charts.speedCurrent.options.scales?.x ?? {}),
        min: 0,
        max: xMax,
        title: {
          ...(charts.speedCurrent.options.scales?.x?.title ?? {}),
          text: xAxisTitle,
        },
      },
      y: { ...(charts.speedCurrent.options.scales?.y ?? {}), min: 0, max: speedMax },
      y1: { ...(charts.speedCurrent.options.scales?.y1 ?? {}), min: 0, max: currentMax },
    };
    charts.speedCurrent.update("none");
    syncChartGeometry(speedCanvas, charts.speedCurrent);

    charts.power.data.datasets[0].data = mechanicalPowerData;
    charts.power.data.datasets[1].data = totalPowerData;
    charts.power.data.datasets[2].data = [powerPoint];
    (
      charts.power.data.datasets[2] as ChartDataset<"line", ChartPoint[]> & {
        tooltipData?: TooltipTableData;
      }
    ).tooltipData = formatOperatingTooltip(operating.point, "power");
    charts.power.options.scales = {
      ...(charts.power.options.scales ?? {}),
      x: {
        ...(charts.power.options.scales?.x ?? {}),
        min: 0,
        max: xMax,
        title: {
          ...(charts.power.options.scales?.x?.title ?? {}),
          text: xAxisTitle,
        },
      },
      y: { ...(charts.power.options.scales?.y ?? {}), min: 0, max: powerMax },
      y1: { ...(charts.power.options.scales?.y1 ?? {}), min: 0, max: currentMax },
    };
    charts.power.update("none");
    syncChartGeometry(powerCanvas, charts.power);

    charts.efficiency.data.datasets[0].data = efficiencyData;
    charts.efficiency.data.datasets[1].data = [efficiencyPoint];
    (
      charts.efficiency.data.datasets[1] as ChartDataset<"line", ChartPoint[]> & {
        tooltipData?: TooltipTableData;
      }
    ).tooltipData = formatOperatingTooltip(operating.point, "efficiency");
    charts.efficiency.options.scales = {
      ...(charts.efficiency.options.scales ?? {}),
      x: {
        ...(charts.efficiency.options.scales?.x ?? {}),
        min: 0,
        max: xMax,
        title: {
          ...(charts.efficiency.options.scales?.x?.title ?? {}),
          text: xAxisTitle,
        },
      },
      y: { ...(charts.efficiency.options.scales?.y ?? {}), min: 0, max: efficiencyMax },
      y1: { ...(charts.efficiency.options.scales?.y1 ?? {}), min: 0, max: currentMax },
    };
    charts.efficiency.update("none");
    syncChartGeometry(efficiencyCanvas, charts.efficiency);
  }

  function renderSweepFrame(updateCharts = false): void {
    const servoHost = options.root.querySelector<HTMLElement>("[data-sim-servo]");
    if (!servoHost) {
      return;
    }

    const operating = buildOperatingPoint(state.config, state.draft, state.sim);
    const rangeValue = options.root.querySelector<HTMLElement>("[data-range-value]");
    const sensitivityValue = options.root.querySelector<HTMLElement>("[data-sensitivity-value]");
    const neutralValue = options.root.querySelector<HTMLElement>("[data-neutral-value]");
    const dampeningValue = options.root.querySelector<HTMLElement>("[data-dampening-value]");
    const proptlValue = options.root.querySelector<HTMLElement>("[data-proptl-value]");
    const powerLimitValue = options.root.querySelector<HTMLElement>("[data-power-limit-value]");
    const pwmValue = options.root.querySelector<HTMLElement>("[data-live-pwm-value]");
    const pwmInput = options.root.querySelector<HTMLInputElement>("[data-slider='pwm']");
    const voltageValue = options.root.querySelector<HTMLElement>("[data-voltage-value]");
    const voltageMarks = options.root.querySelector<HTMLElement>("[data-voltage-detents]");
    const loadValue = options.root.querySelector<HTMLElement>("[data-load-value]");
    const loadInput = options.root.querySelector<HTMLInputElement>("[data-slider='load']");
    const loadMax = options.root.querySelector<HTMLElement>("[data-load-max]");
    const discardButton = options.root.querySelector<HTMLButtonElement>("[data-command='discard']");
    const applyButton = options.root.querySelector<HTMLButtonElement>("[data-command='apply']");
    const sweepButton = options.root.querySelector<HTMLButtonElement>(
      "[data-command='toggle-sweep']",
    );
    const loadSliderMax = maxAvailableTorqueKgcm(
      operating.spec,
      state.sim.voltage,
      state.draft.pwmPowerPercent,
    );

    servoHost.innerHTML = servoSketch(
      operating.spec,
      operating.point,
      state.draft,
      operating.torqueMax,
    );

    if (rangeValue) {
      rangeValue.textContent = `${Math.round((operating.spec.maxRangeDeg * state.draft.rangePercent) / 100)} deg`;
    }
    if (sensitivityValue) {
      sensitivityValue.textContent = `${state.draft.sensitivityStep} · ${sensitivityLabel(state.draft.sensitivityStep)}`;
    }
    if (neutralValue) {
      neutralValue.textContent = `${formatSignedUs(state.draft.neutralUs)} us`;
    }
    if (dampeningValue) {
      dampeningValue.textContent = String(state.draft.dampeningFactor);
    }
    if (proptlValue) {
      proptlValue.textContent = `${state.draft.proptlSeconds.toFixed(1)} s`;
    }
    if (powerLimitValue) {
      powerLimitValue.textContent = `${state.draft.pwmPowerPercent.toFixed(0)} %`;
    }
    if (pwmValue) {
      pwmValue.textContent = `${operating.point.pwmUs} us`;
    }
    if (
      pwmInput &&
      state.draft.mode === "servo_mode" &&
      state.sim.sweepEnabled &&
      document.activeElement !== pwmInput
    ) {
      pwmInput.value = String(operating.point.pwmUs);
    }
    if (voltageValue) {
      voltageValue.textContent = `${state.sim.voltage.toFixed(1)} V`;
    }
    if (voltageMarks) {
      voltageMarks.innerHTML = Array.from(
        new Set(operating.spec.points.map((sample) => sample.voltage.toFixed(1))),
      )
        .map((value) => `<span>${escapeHtml(value)}</span>`)
        .join("");
    }
    if (loadValue) {
      loadValue.textContent = `${state.sim.loadKgcm.toFixed(1)} kgf*cm`;
    }
    if (loadInput) {
      loadInput.max = loadSliderMax.toFixed(2);
      if (document.activeElement !== loadInput) {
        loadInput.value = state.sim.loadKgcm.toFixed(2);
      }
    }
    if (loadMax) {
      loadMax.textContent = loadSliderMax.toFixed(1);
    }
    const liveDirty = isDirty(state.liveSnapshot, state.draft);
    if (discardButton) {
      discardButton.disabled = !(liveDirty && Boolean(state.config) && !state.busyAction);
    }
    if (applyButton) {
      applyButton.disabled = !(
        liveDirty &&
        state.config &&
        options.writeFullConfig &&
        !state.busyAction
      );
    }
    if (sweepButton) {
      sweepButton.innerHTML = sweepControlIcon(state.sim.playbackRunning);
      sweepButton.title =
        state.draft.mode === "servo_mode"
          ? state.sim.sweepEnabled && state.sim.playbackRunning
            ? "Pause sweep"
            : "Play sweep"
          : state.sim.playbackRunning
            ? "Pause animation"
            : "Play animation";
      sweepButton.setAttribute(
        "aria-label",
        state.draft.mode === "servo_mode"
          ? state.sim.sweepEnabled && state.sim.playbackRunning
            ? "Pause sweep"
            : "Play sweep"
          : state.sim.playbackRunning
            ? "Pause animation"
            : "Play animation",
      );
    }
    const pointSnapshot = options.root.querySelector<HTMLElement>("[data-operating-point]");
    if (pointSnapshot) {
      pointSnapshot.dataset.torqueKgcm = operating.point.torqueKgcm.toFixed(3);
      pointSnapshot.dataset.speedRpm = operating.point.speedRpm.toFixed(3);
      pointSnapshot.dataset.currentA = operating.point.currentA.toFixed(3);
      pointSnapshot.dataset.mechanicalPowerW = operating.point.mechanicalPowerW.toFixed(3);
      pointSnapshot.dataset.electricalPowerW = operating.point.electricalPowerW.toFixed(3);
      pointSnapshot.dataset.heatW = operating.point.heatW.toFixed(3);
      pointSnapshot.dataset.efficiency = operating.point.efficiency.toFixed(4);
      pointSnapshot.dataset.effectiveVoltage = operating.point.effectiveVoltage.toFixed(3);
    }
    if (updateCharts) {
      ensureCharts(operating);
    }
  }

  function refreshInteractiveUi(): void {
    renderSweepFrame(true);
  }

  function updateSweepTimer(): void {
    const liveServoPresent =
      state.inventory.openedId !== null && (state.identify?.present ?? Boolean(state.config));
    const shouldRun =
      state.busyAction !== "Apply" &&
      liveServoPresent &&
      ((state.draft.mode === "servo_mode" && state.sim.sweepEnabled && state.sim.playbackRunning) ||
        (state.draft.mode === "cr_mode" &&
          state.sim.playbackRunning &&
          Math.abs(commandRatio(state.draft, state.sim.pwmUs)) > 0.02));
    if (shouldRun && !sweepFrame) {
      const tick = (timestamp: number) => {
        if (!sweepFrame) {
          return;
        }
        if (lastSweepFrameTs === null) {
          lastSweepFrameTs = timestamp;
        }
        const deltaMs = timestamp - lastSweepFrameTs;
        lastSweepFrameTs = timestamp;
        if (state.draft.mode === "servo_mode") {
          state.sim.servoSweepPhase = (state.sim.servoSweepPhase + (deltaMs * 0.04) / 90) % 2;
        } else {
          const operating = buildOperatingPoint(state.config, state.draft, state.sim);
          const degreesPerMs =
            ((operating.point.speedRpm * 360) / 60000) *
            (operating.point.commandSigned >= 0 ? 1 : -1);
          state.sim.crAngleDeg =
            (((state.sim.crAngleDeg + deltaMs * degreesPerMs) % 360) + 360) % 360;
        }
        renderSweepFrame();
        sweepFrame = window.requestAnimationFrame(tick);
      };
      sweepFrame = window.requestAnimationFrame(tick);
    }
    if (!shouldRun && sweepFrame) {
      window.cancelAnimationFrame(sweepFrame);
      sweepFrame = null;
      lastSweepFrameTs = null;
    }
  }

  function updateLivePollTimer(): void {
    const shouldRun = (options.livePollIntervalMs ?? 0) > 0;
    if (shouldRun && !livePollTimer) {
      livePollTimer = setInterval(() => {
        const liveDirty = isDirty(state.liveSnapshot, state.draft);
        if (
          state.inventory.openedId !== null &&
          !state.busyAction &&
          !liveDirty &&
          Date.now() >= resizeQuietUntil
        ) {
          void probeLiveStateSilently();
        }
      }, options.livePollIntervalMs);
    }
    if (!shouldRun && livePollTimer) {
      clearInterval(livePollTimer);
      livePollTimer = null;
    }
  }

  async function probeLiveStateSilently(): Promise<void> {
    if (
      liveProbeInFlight ||
      state.busyAction ||
      state.inventory.openedId === null ||
      Date.now() < resizeQuietUntil
    ) {
      return;
    }

    liveProbeInFlight = true;
    let shouldRender = false;

    try {
      if (!options.identifyServo) {
        return;
      }

      const previousPresent = state.identify?.present === true || state.config !== null;
      const previousMode = state.identify?.mode ?? "unknown";
      if (!previousPresent) {
        setStatus("Checking for servo");
      }
      const identifyReply = await options.identifyServo.run();

      if (!identifyReply.present) {
        missingServoStreak += 1;
        if (missingServoStreak >= 2) {
          state.identify = identifyReply;
          if (state.config !== null || previousPresent || state.error !== null) {
            state.config = null;
            state.error = null;
            updateSweepTimer();
            shouldRender = true;
          }
        }
        return;
      }

      missingServoStreak = 0;
      probeFailureStreak = 0;
      state.identify = identifyReply;
      if (state.error !== null) {
        state.error = null;
        shouldRender = true;
      }

      const readFullConfigAction = options.readFullConfig;
      const shouldLoadConfig =
        readFullConfigAction !== undefined &&
        (state.config === null ||
          previousPresent === false ||
          (previousMode !== "unknown" && previousMode !== identifyReply.mode));

      if (!shouldLoadConfig) {
        if (previousPresent === false || previousMode !== identifyReply.mode) {
          shouldRender = true;
        }
        lastSilentError = null;
        return;
      }

      try {
        const previousModelId = state.config?.modelId ?? null;
        if (state.config === null) {
          setStatus("Reading setup");
        }
        const config = await readFullConfigAction.run();
        applyConfig(config);
        lastSilentError = null;
        shouldRender = true;

        const identityLabel = servoIdentityLabel(config, true);
        if (previousModelId !== config.modelId && identityLabel !== "Detected") {
          setStatus(`Servo detected: ${identityLabel}`);
        }
        setIdleStatus(previousModelId === config.modelId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        probeFailureStreak += 1;
        if (lastSilentError !== message) {
          logger.debug(`Probe retry: ${message}`);
          lastSilentError = message;
        }
        if (probeFailureStreak >= 2 && (state.config !== null || previousPresent)) {
          state.identify = null;
          state.config = null;
          updateSweepTimer();
          setStatus("Checking for servo", false);
          shouldRender = true;
        } else if (previousPresent === false) {
          shouldRender = true;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      probeFailureStreak += 1;
      if (lastSilentError !== message) {
        logger.debug(`Probe retry: ${message}`);
        lastSilentError = message;
      }
      if (probeFailureStreak >= 2 && (state.config !== null || state.identify?.present === true)) {
        state.identify = null;
        state.config = null;
        updateSweepTimer();
        setStatus("Checking for servo", false);
        shouldRender = true;
      }
    } finally {
      liveProbeInFlight = false;
      if (shouldRender) {
        render();
      }
    }
  }

  function handleResize(): void {
    if (state.busyAction === "Apply") {
      return;
    }
    resizeQuietUntil = Date.now() + RESIZE_POLL_QUIET_MS;
    if (resizeEndTimer) {
      clearTimeout(resizeEndTimer);
    }
    resizeEndTimer = setTimeout(() => {
      resizeEndTimer = null;
      refreshInteractiveUi();
    }, RESIZE_POLL_QUIET_MS);
  }

  async function doAuthorizeAndConnect(): Promise<void> {
    if (state.busyAction || !options.requestDevice) return;

    state.busyAction = "Connect";
    state.error = null;
    setStatus("Requesting USB permission");
    render();

    try {
      updateInventory(await options.requestDevice.run());
      await doConnectAndSync(false, true);
      return;
    } catch (error) {
      reportError(error);
    } finally {
      if (state.busyAction === "Connect") {
        state.busyAction = null;
        render();
      }
    }
  }

  async function doConnectAndSync(allowRequest = false, alreadyBusy = false): Promise<void> {
    if (state.busyAction && !alreadyBusy) return;
    if (!alreadyBusy) {
      state.busyAction = "Connect";
      state.error = null;
      setStatus(allowRequest ? "Requesting USB permission" : "Opening adapter");
      render();
    }
    try {
      if (!state.inventory.openedId) {
        if (!state.inventory.devices.length && allowRequest && options.requestDevice) {
          updateInventory(await options.requestDevice.run());
        }
        if (!state.inventory.devices.length && options.reconnectDevice) {
          updateInventory(await options.reconnectDevice.run());
        }
        if (!state.inventory.devices.length && options.refreshInventory) {
          updateInventory(await options.refreshInventory.run());
        }
        if (!state.inventory.devices.length) {
          throw new Error(
            "Adapter not detected. Please ensure it is plugged in, then unplug and replug it.",
          );
        }
        if (options.openDevice) {
          setStatus("Opening adapter", false);
          updateInventory(await options.openDevice.run());
        }
      }

      if (!state.inventory.openedId) {
        throw new Error("Adapter not connected. Please unplug and replug it, then try again.");
      }

      if (options.identifyServo) {
        setStatus("Checking for servo");
        const identifyReply = await options.identifyServo.run();
        state.identify = identifyReply;
        if (!identifyReply.present) {
          state.config = null;
          updateSweepTimer();
          setStatus("Checking for servo", false);
          return;
        }
      }

      if (options.readFullConfig) {
        setStatus("Reading setup");
        const config = await options.readFullConfig.run();
        applyConfig(config);
      }

      setIdleStatus();
    } catch (error) {
      reportError(error);
    } finally {
      if (!alreadyBusy) {
        state.busyAction = null;
        render();
      }
    }
  }

  function savePayload(): Record<string, unknown> {
    return {
      kind: "axon-config-draft",
      version: 2,
      savedAt: new Date().toISOString(),
      config: state.draft,
      modelId: state.config?.modelId ?? null,
      mode: state.draft.mode,
    };
  }

  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function triggerSave(format: "axon" | "svo"): Promise<void> {
    const baseName = `axon-${(state.config?.modelId ?? "draft").toLowerCase()}`;
    const payload = savePayload();
    const axonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const svoBytes = state.baselineRawBytes
      ? encodeDraftOntoRawConfig(Uint8Array.from(state.baselineRawBytes), state.draft)
      : null;
    const suggestedName = `${baseName}.${format}`;

    if (format === "axon" && options.saveAxonFile) {
      try {
        const result = await options.saveAxonFile.run({
          suggestedName,
          text: JSON.stringify(payload, null, 2),
        });
        if (result && "path" in result && result.path === null) {
          setIdleStatus();
          return;
        }
        setStatus("Saved .axon");
        setIdleStatus();
      } catch (error) {
        reportError(error);
        render();
      }
      return;
    }

    if (format === "svo" && options.exportSvoFile) {
      try {
        if (!svoBytes) {
          throw new Error("No raw config block is available for .svo export yet.");
        }
        const result = await options.exportSvoFile.run({
          suggestedName,
          bytes: Array.from(svoBytes),
        });
        if (result && "path" in result && result.path === null) {
          setIdleStatus();
          return;
        }
        setStatus("Saved .svo");
        setIdleStatus();
      } catch (error) {
        reportError(error);
        render();
      }
      return;
    }

    type SavePickerWindow = Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string;
        types?: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<{
        name?: string;
        createWritable: () => Promise<{
          write: (data: Blob | BufferSource | string) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    };

    const saveWindow = window as SavePickerWindow;
    if (typeof saveWindow.showSaveFilePicker === "function") {
      try {
        const handle = await saveWindow.showSaveFilePicker({
          suggestedName,
          types:
            format === "axon"
              ? [
                  {
                    description: "Axon config (.axon)",
                    accept: { "application/json": [".axon"] },
                  },
                ]
              : [
                  {
                    description: "Vendor programmer config (.svo)",
                    accept: { "application/octet-stream": [".svo"] },
                  },
                ],
        });
        if (format === "svo") {
          if (!svoBytes) {
            throw new Error("No raw config block is available for .svo export yet.");
          }
          const binary = new Uint8Array(Array.from(svoBytes));
          const writable = await handle.createWritable();
          await writable.write(new Blob([binary], { type: "application/octet-stream" }));
          await writable.close();
          setStatus("Saved .svo");
        } else {
          const writable = await handle.createWritable();
          await writable.write(JSON.stringify(payload, null, 2));
          await writable.close();
          setStatus("Saved .axon");
        }
        setIdleStatus();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setIdleStatus();
          return;
        }
        reportError(error);
        render();
        return;
      }
    }

    if (format === "svo") {
      if (!svoBytes) {
        reportError("No raw config block is available for .svo export yet.");
        render();
        return;
      }
      const binary = new Uint8Array(Array.from(svoBytes));
      downloadBlob(new Blob([binary], { type: "application/octet-stream" }), `${baseName}.svo`);
      setStatus("Saved .svo");
    } else {
      downloadBlob(axonBlob, `${baseName}.axon`);
      setStatus("Saved .axon");
    }
    setIdleStatus();
  }

  function applyLoadedDraft(value: unknown): void {
    if (!value || typeof value !== "object") {
      throw new Error("Unsupported file format.");
    }
    const payload = value as {
      config?: Partial<DraftConfig>;
      draft?: Partial<DraftConfig & SimState>;
    };
    const configDraft = payload.config ?? payload.draft;
    if (!configDraft) {
      throw new Error("Missing draft payload.");
    }

    const previousMode = state.draft.mode;
    const nextDraft = draftFromPartial(configDraft, state.draft);
    adoptDraft(nextDraft, previousMode);
    state.loadPanelOpen = false;
    state.error = null;
    render();
    setStatus("Loaded config");
    setIdleStatus();
  }

  function handleSvoFile(file: File): void {
    const reader = new FileReader();
    reader.onerror = () => {
      reportError("Could not read file.");
      render();
    };
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        const mode: CoreServoMode =
          state.identify?.mode && state.identify.mode !== "unknown"
            ? state.identify.mode
            : state.draft.mode;
        const config = configInfoFromRawBytes(bytes, mode);
        const nextDraft = draftFromConfig(config, state.draft);
        adoptDraft(nextDraft, state.draft.mode);
        state.loadPanelOpen = false;
        state.error = null;
        render();
        setStatus(`Loaded ${file.name}`);
        setIdleStatus();
      } catch (error) {
        reportError(error);
        render();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFile(file: File): void {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".svo")) {
      handleSvoFile(file);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      reportError("Could not read file.");
      render();
    };
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ""));
        applyLoadedDraft(parsed);
      } catch (error) {
        reportError(error);
        render();
      }
    };
    reader.readAsText(file);
  }

  function handleLoadedFile(file: ProbeLoadedFile): void {
    if (file.format === "svo") {
      try {
        if (!Array.isArray(file.bytes)) {
          throw new Error("Selected .svo file did not provide binary bytes.");
        }
        const bytes = Uint8Array.from(file.bytes);
        const mode: CoreServoMode =
          state.identify?.mode && state.identify.mode !== "unknown"
            ? state.identify.mode
            : state.draft.mode;
        const config = configInfoFromRawBytes(bytes, mode);
        const nextDraft = draftFromConfig(config, state.draft);
        adoptDraft(nextDraft, state.draft.mode);
        state.loadPanelOpen = false;
        state.error = null;
        render();
        setStatus(`Loaded ${file.name}`);
        setIdleStatus();
      } catch (error) {
        reportError(error);
        render();
      }
      return;
    }

    try {
      if (typeof file.text !== "string") {
        throw new Error("Selected .axon file did not provide text.");
      }
      const parsed = JSON.parse(file.text);
      applyLoadedDraft(parsed);
      setStatus(`Loaded ${file.name}`);
      setIdleStatus();
    } catch (error) {
      reportError(error);
      render();
    }
  }

  async function promptLoadFile(fileInput: HTMLInputElement | null): Promise<void> {
    if (options.loadConfigFile) {
      try {
        const loaded = await options.loadConfigFile.run();
        if (loaded) {
          handleLoadedFile(loaded);
        }
      } catch (error) {
        reportError(error);
        render();
      }
      return;
    }

    type OpenPickerWindow = Window & {
      showOpenFilePicker?: (options: {
        multiple?: boolean;
        excludeAcceptAllOption?: boolean;
        types?: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<Array<{ getFile: () => Promise<File> }>>;
    };

    const openWindow = window as OpenPickerWindow;
    if (typeof openWindow.showOpenFilePicker === "function") {
      try {
        const handles = await openWindow.showOpenFilePicker({
          multiple: false,
          excludeAcceptAllOption: false,
          types: [
            {
              description: "Axon config files",
              accept: {
                "application/json": [".axon"],
                "application/octet-stream": [".svo"],
              },
            },
          ],
        });
        const file = await handles[0]?.getFile();
        if (file) {
          handleFile(file);
        }
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    fileInput?.click();
  }

  function render(): void {
    const previousStatusLog = options.root.querySelector<HTMLElement>(".status-log-list");
    if (previousStatusLog) {
      statusLogScrollTop = previousStatusLog.scrollTop;
      statusLogPinnedToBottom =
        previousStatusLog.scrollTop + previousStatusLog.clientHeight >=
        previousStatusLog.scrollHeight - 8;
    }
    destroyCharts();
    const connected = Boolean(state.inventory.openedId);
    const visible = state.inventory.devices.length > 0;
    const servoPresent = state.identify?.present ?? Boolean(state.config);
    const showStableLiveState =
      state.busyAction === "Apply" ||
      state.busyAction === "Recover" ||
      state.applyProgress !== null;
    const connectedUi = connected || showStableLiveState;
    const servoPresentUi = servoPresent || (showStableLiveState && Boolean(state.config));
    const activeModelId = servoPresent ? (state.config?.modelId ?? null) : null;
    const activeModelName = servoPresent
      ? shortModelLabel(state.config?.modelName ?? activeModelId)
      : null;
    const fileActionsEnabled = connected && servoPresent && Boolean(state.config);
    const visibleCheckpoints =
      activeModelId === null
        ? []
        : state.checkpoints
            .filter((checkpoint) => checkpoint.modelId === activeModelId)
            .slice(0, 3);
    const liveDirty = isDirty(state.liveSnapshot, state.draft);
    const servoLabel = servoIdentityLabel(state.config, servoPresentUi);
    const selectedRecoveryModel = state.recoveryBundledModelId
      ? findModel(loadCatalog(), state.recoveryBundledModelId)
      : undefined;
    const canRecover = Boolean(options.flashModeChange || options.flashFirmwareFile);
    const recoverySelectionValid =
      state.recoverySource === "bundled"
        ? Boolean(selectedRecoveryModel && options.flashModeChange)
        : Boolean(state.recoveryFile && options.flashFirmwareFile);
    const recoverySummaryLabel =
      state.recoverySource === "bundled"
        ? shortModelLabel(selectedRecoveryModel?.name ?? null)
        : shortModelLabel(state.recoveryFileModelName ?? state.recoveryFileModelId);
    const canDiscard = liveDirty && Boolean(state.config) && !state.busyAction;
    const canApply =
      liveDirty && Boolean(state.config) && Boolean(options.writeFullConfig) && !state.busyAction;
    const emptyState: EmptyStateKind = !connectedUi ? "adapter" : !servoPresentUi ? "servo" : null;
    const showRange = state.draft.mode === "servo_mode";
    const centerLabel = state.draft.mode === "servo_mode" ? "Center" : "Stop trim";
    const showSoftStart = state.draft.mode === "servo_mode";
    const showSensitivity = state.draft.mode === "servo_mode";
    const showDampening = state.draft.mode === "servo_mode";
    const showOverload = state.draft.mode === "servo_mode";
    const showSignalLoss = state.draft.mode === "servo_mode";
    const showProptl = state.draft.mode === "cr_mode";
    const operating = buildOperatingPoint(state.config, state.draft, state.sim);
    const voltageDetents = Array.from(
      new Set(operating.spec.points.map((sample) => sample.voltage.toFixed(1))),
    );
    const loadSliderMax = maxAvailableTorqueKgcm(
      operating.spec,
      state.sim.voltage,
      state.draft.pwmPowerPercent,
    );
    const point = operating.point;

    const diagnostics = {
      environment: state.environment,
      inventory: state.inventory,
      identify: state.identify,
      config: state.config,
      draft: state.draft,
      sim: state.sim,
      point,
      logs: state.logs,
    };

    options.root.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        html { overflow-y: scroll; }
        body {
          margin: 0;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        :root {
          color-scheme: light;
          --config-pane-width: 300px;
          --sim-column-min-width: 300px;
          --sim-pane-min-width: calc(
            var(--sim-column-min-width) + var(--sim-column-min-width) + 18px
          );
          --frame-min-width: calc(
            var(--config-pane-width) + var(--sim-pane-min-width) + 12px
          );
        }

        .shell {
          min-height: 100vh;
          padding: 12px;
          background: #f8f8f6;
          color: #111111;
          overflow-x: auto;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .frame {
          width: max(100%, var(--frame-min-width));
          min-width: var(--frame-min-width);
          max-width: 1640px;
          margin: 0 auto;
        }

        .topline {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          align-items: center;
          margin-bottom: 12px;
          padding: 8px 10px;
          border-radius: 8px;
          background: #161616;
          color: #f7f7f7;
        }

        .top-menu {
          position: relative;
          display: inline-flex;
          align-items: center;
        }

        .menu-button {
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: 8px;
          border: 1px solid #333333;
          background: #1e1e1e;
          color: #f7f7f7;
          font: inherit;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .menu-button:hover:not(:disabled) {
          border-color: #6b7280;
        }

        .menu-button-lines {
          width: 16px;
          height: 12px;
          display: grid;
          align-content: space-between;
        }

        .menu-button-lines span {
          display: block;
          height: 2px;
          border-radius: 999px;
          background: currentColor;
        }

        .top-menu-panel {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          z-index: 30;
          min-width: 280px;
          padding: 10px;
          border: 1px solid #2d2d2d;
          border-radius: 8px;
          background: #1b1b1b;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
          display: grid;
          gap: 10px;
        }

        .top-menu-copy {
          color: #c7ccd4;
          font-size: 12px;
          line-height: 1.45;
        }

        .top-menu-actions {
          display: grid;
          gap: 8px;
        }

        .top-menu-actions .tool {
          width: 100%;
          text-align: left;
          justify-content: flex-start;
        }

        .top-menu-section-title {
          color: #9ca3af;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .top-menu-checkpoints {
          display: grid;
          gap: 8px;
          max-height: 220px;
          overflow: auto;
        }

        .top-menu-checkpoints .checkpoint-item,
        .top-menu-checkpoints .checkpoint-empty {
          background: #111111;
          border-color: #2d2d2d;
          color: #f7f7f7;
        }

        .top-menu-checkpoints .checkpoint-meta {
          color: #9ca3af;
        }

        .toolbar {
          display: inline-flex;
          gap: 8px;
          align-items: center;
        }

        .brand {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          background: #e40014;
          box-shadow: 10px 0 0 #ffffff;
          margin-right: 8px;
        }

        .tool,
        .apply {
          height: 32px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid #333333;
          background: #1e1e1e;
          color: inherit;
          font: inherit;
          cursor: pointer;
        }

        .apply {
          border-color: #6d000c;
          background: #9e0814;
        }

        .tool:hover:not(:disabled),
        .apply:hover:not(:disabled) {
          border-color: #6b7280;
        }

        .tool:disabled,
        .apply:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .statebar {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 220px));
          gap: 8px;
        }

        .actions {
          display: inline-flex;
          gap: 8px;
          align-items: center;
        }

        .actions .tool,
        .actions .apply {
          min-width: 76px;
        }

        .state {
          display: grid;
          gap: 2px;
          min-width: 0;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid #2d2d2d;
          background: #1b1b1b;
        }

        .state-button {
          width: 100%;
          text-align: left;
          cursor: pointer;
        }

        .state-label {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          color: #9ca3af;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .state-value {
          min-width: 0;
          color: #f7f7f7;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .state-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #676767;
          flex: 0 0 auto;
        }

        .ok .state-dot { background: #00a544; }
        .warn .state-dot { background: #f99c00; }
        .live .state-dot { background: #e40014; }

        .error {
          margin-bottom: 12px;
          padding: 10px 12px;
          border: 1px solid #f0b5bc;
          border-radius: 8px;
          background: #fff1f2;
          color: #8c101e;
          font-size: 13px;
        }

        .apply-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: rgba(17, 17, 17, 0.34);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .apply-modal {
          width: min(460px, 100%);
          padding: 18px 18px 16px;
          border-radius: 8px;
          border: 1px solid #dcded9;
          background: #ffffff;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
          display: grid;
          gap: 12px;
        }

        .apply-modal-title {
          font-size: 18px;
          font-weight: 800;
          color: #111111;
        }

        .apply-modal-copy {
          font-size: 13px;
          line-height: 1.45;
          color: #4b5563;
        }

        .apply-progress-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 12px;
          font-weight: 700;
          color: #374151;
        }

        .apply-progress-track {
          height: 10px;
          border-radius: 999px;
          background: #e8edf3;
          overflow: hidden;
        }

        .apply-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: #1f6ed4;
          transition: width 120ms linear;
        }

        .apply-modal-note {
          font-size: 12px;
          line-height: 1.4;
          color: #6b7280;
        }

        .confirm-modal {
          width: min(460px, 100%);
          padding: 18px 18px 16px;
          border-radius: 8px;
          border: 1px solid #dcded9;
          background: #ffffff;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
          display: grid;
          gap: 12px;
        }

        .confirm-copy {
          font-size: 13px;
          line-height: 1.45;
          color: #4b5563;
        }

        .confirm-warning {
          padding: 10px 12px;
          border: 1px solid #f0b5bc;
          border-radius: 8px;
          background: #fff1f2;
          color: #8c101e;
          font-size: 12px;
          line-height: 1.45;
        }

        .confirm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        .confirm-actions-left {
          justify-content: flex-start;
          align-items: center;
        }

        .recovery-source-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .workspace {
          display: grid;
          grid-template-columns: var(--config-pane-width) minmax(var(--sim-pane-min-width), 1fr);
          gap: 12px;
          align-items: start;
        }

        .pane {
          border: 1px solid #dcded9;
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
          min-width: 0;
        }

        .config-pane {
          position: relative;
          padding: 14px;
          display: grid;
          gap: 14px;
          min-width: 0;
          width: 100%;
          max-width: var(--config-pane-width);
          justify-self: start;
        }

        .config-pane.dragging {
          background: #f7fafc;
          border-color: #5aa5ff;
        }

        .mode-row,
        .direction-row {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .loss-row {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .mode-button,
        .direction-button,
        .loss-button,
        .load-save-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 44px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid #d4d9e0;
          background: #fafaf8;
          color: #111111;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }

        .mode-button[data-selected="true"],
        .direction-button[data-selected="true"],
        .loss-button[data-selected="true"] {
          background: #ffffff;
          border-color: #111111;
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
          gap: 12px;
        }

        .setting-label {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          color: #4c5664;
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
          padding: 0;
          border-radius: 999px;
          border: 1px solid #ccd2d9;
          background: #ffffff;
          color: #737c89;
          font-size: 11px;
          line-height: 1;
          cursor: help;
          appearance: none;
          -webkit-appearance: none;
        }

        .help:focus-visible {
          outline: 2px solid #5aa5ff;
          outline-offset: 2px;
        }

        .slider {
          width: 100%;
          margin: 0;
          accent-color: #1f6ed4;
        }

        .number-input {
          width: 100%;
          min-height: 38px;
          padding: 0 10px;
          border: 1px solid #d4d9e0;
          border-radius: 8px;
          background: #ffffff;
          color: #111111;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
        }

        .number-input:disabled {
          background: #f2f4f7;
          border-color: #e5e7eb;
          color: #9ca3af;
          cursor: not-allowed;
        }

        .unit-input {
          position: relative;
          display: flex;
          align-items: center;
        }

        .unit-input .number-input {
          padding-right: 44px;
        }

        .unit-suffix {
          position: absolute;
          right: 10px;
          color: #6b7280;
          font-size: 12px;
          font-weight: 700;
          pointer-events: none;
        }

        .unit-input[data-disabled="true"] .unit-suffix {
          color: #b6bcc7;
        }

        .compound-grid {
          display: grid;
          gap: 8px;
        }

        .compound-row {
          display: grid;
          gap: 8px;
          grid-template-columns: 58px minmax(0, 1fr);
          align-items: center;
        }

        .compound-label {
          color: #4c5664;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .compound-inputs {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .compound-caption {
          color: #95a0ae;
          font-size: 11px;
          text-align: right;
        }

        .toggle-setting {
          display: grid;
          gap: 8px;
        }

        .toggle-pills {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .toggle-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 44px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid #d4d9e0;
          background: #fafaf8;
          color: #111111;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }

        .toggle-pill[data-selected="true"] {
          background: #ffffff;
          border-color: #111111;
          box-shadow: inset 0 0 0 1px #111111;
        }

        .checkpoint-list {
          display: grid;
          gap: 8px;
          max-height: 220px;
          overflow: auto;
        }

        .checkpoint-item {
          display: grid;
          gap: 2px;
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d4d9e0;
          border-radius: 8px;
          background: #ffffff;
          color: #111111;
          text-align: left;
          cursor: pointer;
        }

        .checkpoint-item:hover {
          border-color: #6b7280;
        }

        .checkpoint-label {
          font-size: 13px;
          font-weight: 700;
        }

        .checkpoint-meta {
          color: #6b7280;
          font-size: 12px;
        }

        .checkpoint-empty {
          color: #6b7280;
          font-size: 12px;
          line-height: 1.4;
        }

        .sim-pane {
          padding: 14px;
          display: grid;
          gap: 12px;
          min-width: 0;
        }

        .empty-pane {
          min-height: 420px;
          display: grid;
          place-items: center;
          padding: 24px;
        }

        .empty-content {
          max-width: 520px;
          text-align: center;
          display: grid;
          gap: 12px;
        }

        .empty-title {
          margin: 0;
          font-size: 28px;
          line-height: 1.1;
        }

        .empty-copy {
          margin: 0;
          color: #5b6674;
          font-size: 15px;
          line-height: 1.5;
        }

        .empty-action {
          justify-self: center;
          min-height: 40px;
          padding: 0 18px;
          border-radius: 999px;
          border: 1px solid #111111;
          background: #ffffff;
          color: #111111;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .empty-action:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .empty-note {
          margin: -4px 0 0;
          color: #6b7280;
          font-size: 13px;
          line-height: 1.4;
        }

        .empty-link {
          padding: 0;
          border: 0;
          background: none;
          color: #1f6ed4;
          font: inherit;
          font-weight: 700;
          text-decoration: underline;
          cursor: pointer;
        }

        .empty-link:disabled {
          color: #9ca3af;
          cursor: default;
          text-decoration: none;
        }

        .status-log {
          margin-bottom: 12px;
          padding: 10px 12px;
          border: 1px solid #dcded9;
          border-radius: 8px;
          background: #ffffff;
        }

        .status-log-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .status-log-title {
          color: #111111;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .status-log-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .status-log-button {
          height: 28px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid #d4d9e0;
          background: #fafaf8;
          color: #111111;
          font: inherit;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }

        .status-log-list {
          display: grid;
          gap: 6px;
          max-height: 220px;
          overflow: auto;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          line-height: 1.4;
        }

        .status-log-entry {
          color: #1f2937;
        }

        .status-log-entry[data-level="debug"] {
          color: #6b7280;
        }

        .status-log-time {
          color: #6b7280;
          margin-right: 8px;
        }

        .sim-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(var(--sim-column-min-width), 1fr));
          gap: 18px;
          align-items: start;
        }

        .sim-left {
          display: grid;
          gap: 12px;
          min-width: 0;
        }

        .sim-right {
          display: grid;
          gap: 12px;
          min-width: 0;
        }

        .servo-card {
          padding: 14px;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfbf9 100%);
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
          gap: 10px;
        }

        .servo-card-figure {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 0;
        }

        .servo-card-controls {
          display: flex;
          justify-content: flex-start;
        }

        .servo-sweep-control {
          position: relative;
          z-index: 1;
          width: 40px;
          height: 40px;
          border: none;
          border-radius: 999px;
          background: rgba(17, 17, 17, 0.88);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
          appearance: none;
          -webkit-appearance: none;
          touch-action: manipulation;
          user-select: none;
        }

        .servo-sweep-control svg {
          width: 18px;
          height: 18px;
          display: block;
          pointer-events: none;
        }

        .servo-sweep-control svg * {
          pointer-events: none;
        }

        [data-sim-servo] {
          pointer-events: none;
        }

        .servo-svg {
          width: 100%;
          max-width: 340px;
          height: auto;
          display: block;
        }

        .sim-sliders {
          display: grid;
          gap: 14px;
          grid-template-columns: minmax(0, 1fr);
        }

        .mini-row {
          display: grid;
          gap: 10px;
          grid-template-columns: 104px minmax(0, 1fr);
          align-items: center;
        }

        .mini-label {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          color: #202734;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .mini-value {
          margin-bottom: 6px;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          font-weight: 700;
        }

        .mini-range {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          color: #a0a7b1;
          font-size: 11px;
          font-weight: 700;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }

        .chart-card {
          padding: 10px;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          background: #ffffff;
          min-width: 0;
          overflow: hidden;
        }

        .chart-canvas-wrap {
          position: relative;
          height: 168px;
          min-width: 0;
        }

        .chart-canvas-wrap canvas {
          display: block;
          width: 100% !important;
          height: 100% !important;
        }

        .chart-tooltip {
          position: fixed;
          z-index: 9999;
          min-width: 320px;
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(17, 17, 17, 0.94);
          color: #f7f7f7;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          opacity: 0;
          transition: opacity 80ms linear;
        }

        .chart-tooltip-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          line-height: 1.35;
        }

        .chart-tooltip-table th,
        .chart-tooltip-table td {
          padding: 2px 6px;
          text-align: left;
          white-space: nowrap;
        }

        .chart-tooltip-table thead th {
          color: #9aa3af;
          font-size: 10px;
          text-transform: uppercase;
        }

        .chart-tooltip-table tbody th {
          color: #d1d5db;
          font-weight: 700;
        }

        .help-tooltip {
          position: fixed;
          z-index: 10000;
          max-width: 320px;
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(17, 17, 17, 0.94);
          color: #f7f7f7;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.45;
          letter-spacing: 0;
          -webkit-font-smoothing: antialiased;
          opacity: 0;
          transition: opacity 80ms linear;
        }

        .chart-meta {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 4px;
          color: #b0b7c1;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .chart-svg {
          width: 100%;
          height: auto;
          display: block;
        }

        .chart-axis {
          fill: #9aa3af;
          font-size: 11px;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }

        .chart-label {
          fill: #9aa3af;
          font-size: 11px;
        }

        details.debug {
          margin-top: 12px;
        }

        details.debug > summary {
          list-style: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
        }

        details.debug > summary::-webkit-details-marker {
          display: none;
        }

        .debug-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 30px;
          padding: 0 12px;
          border: 1px solid #d4d9e0;
          border-radius: 8px;
          background: #ffffff;
          color: #4c5664;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .debug-panel {
          margin-top: 8px;
          padding: 12px;
          border: 1px solid #dcded9;
          border-radius: 8px;
          background: #ffffff;
        }

        .debug-panel pre {
          margin: 0;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 12px;
          line-height: 1.4;
          color: #1f2937;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }

      </style>
      <div class="shell">
        <div class="frame">
          <div class="topline">
            <div class="top-menu">
              <button class="menu-button" type="button" data-command="toggle-file-menu" aria-label="Open file menu" title="Config files">
                <span class="menu-button-lines" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </button>
              ${
                state.loadPanelOpen
                  ? `
                    <div class="top-menu-panel" data-load-panel>
                      <div class="top-menu-actions">
                        <button class="tool" type="button" data-command="load-file" ${!fileActionsEnabled ? "disabled" : ""}>Load config</button>
                        <button class="tool" type="button" data-command="save-axon" ${!fileActionsEnabled ? "disabled" : ""}>Save .axon config</button>
                        <button class="tool" type="button" data-command="save-svo" ${!fileActionsEnabled ? "disabled" : ""}>Export .svo vendor file</button>
                      </div>
                      ${
                        activeModelName
                          ? `
                            <div class="top-menu-section-title">${escapeHtml(activeModelName)} Checkpoints</div>
                            <div class="top-menu-checkpoints">
                              ${
                                visibleCheckpoints.length > 0
                                  ? visibleCheckpoints
                                      .map(
                                        (checkpoint) => `
                                          <button class="checkpoint-item" type="button" data-command="load-checkpoint" data-checkpoint-id="${escapeHtml(checkpoint.id)}">
                                            <span class="checkpoint-label">${escapeHtml(formatRelativeTime(checkpoint.createdAt))}</span>
                                          </button>
                                        `,
                                      )
                                      .join("")
                                  : `<div class="checkpoint-empty">No ${escapeHtml(activeModelName)} checkpoints yet.</div>`
                              }
                            </div>
                          `
                          : ""
                      }
                    </div>
                  `
                  : ""
              }
            </div>
            <div class="statebar">
              <div class="state ${connectedUi ? "ok" : visible ? "warn" : ""}" title="Adapter state">
                <span class="state-label"><span class="state-dot"></span>Adapter</span>
                <span class="state-value">${connectedUi ? "Connected" : "Not Connected"}</span>
              </div>
              <div class="state ${servoPresentUi ? "ok" : connectedUi ? "warn" : ""}" title="Servo state">
                <span class="state-label"><span class="state-dot"></span>Servo</span>
                <span class="state-value">${escapeHtml(servoLabel)}</span>
              </div>
              <button class="state state-button ${state.statusMessage === "Ready" ? "ok" : "live"}" type="button" data-command="toggle-status-log" title="Show status log">
                <span class="state-label"><span class="state-dot"></span>Status</span>
                <span class="state-value">${escapeHtml(state.statusMessage)}</span>
              </button>
            </div>
            <div class="actions">
              <button class="tool" data-command="discard" ${!canDiscard ? "disabled" : ""} title="Throw away local edits and reload the servo's current setup.">Discard</button>
              <button class="apply" data-command="apply" ${!canApply ? "disabled" : ""} title="Make the attached servo match the current draft. Mode changes still require flash wiring.">Apply</button>
            </div>
          </div>

          ${
            state.statusOpen
              ? `
                <div class="status-log">
                  <div class="status-log-head">
                    <div class="status-log-title">Status Log</div>
                    <div class="status-log-actions">
                      <button class="status-log-button" type="button" data-command="copy-status-log">Copy</button>
                      <button class="status-log-button" type="button" data-command="toggle-status-log" aria-label="Close status log">x</button>
                    </div>
                  </div>
                    <div class="status-log-list">
                    ${state.logs
                      .map(
                        (entry) => `
                          <div class="status-log-entry" data-level="${entry.level}">
                            <span class="status-log-time">[${escapeHtml(entry.timestamp)}]</span>${entry.level === "debug" ? '<span class="status-log-time">[debug]</span>' : ""}${escapeHtml(entry.message)}
                          </div>
                        `,
                      )
                      .join("")}
                  </div>
                </div>
              `
              : ""
          }

          ${state.error && !showStableLiveState ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}

          ${
            (state.busyAction === "Apply" || state.busyAction === "Recover") && state.applyProgress
              ? `
                <div class="apply-modal-backdrop" role="dialog" aria-modal="true" aria-label="${escapeHtml(state.applyProgress.title)}">
                  <div class="apply-modal">
                    <div class="apply-modal-title">${escapeHtml(state.applyProgress.title)}</div>
                    <div class="apply-modal-copy">${
                      state.busyAction === "Recover"
                        ? "The app is reflashing the servo with the selected recovery firmware."
                        : "The attached servo is being updated to match the current settings."
                    }</div>
                    <div class="apply-progress-meta">
                      <span>${escapeHtml(state.applyProgress.detail)}</span>
                      <span>${Math.round(state.applyProgress.percent)}%</span>
                    </div>
                    <div class="apply-progress-track" aria-hidden="true">
                      <div class="apply-progress-fill" style="width:${state.applyProgress.percent.toFixed(1)}%"></div>
                    </div>
                    <div class="apply-modal-note">Do not unplug the adapter or servo while changes are being applied.</div>
                  </div>
                </div>
              `
              : ""
          }

          ${
            state.recoveryConfirmOpen
              ? `
                <div class="apply-modal-backdrop" role="dialog" aria-modal="true" aria-label="Recover Servo">
                  <div class="confirm-modal">
                    <div class="apply-modal-title">Recover Servo</div>
                    <div class="confirm-copy">
                      Choose a bundled firmware by model and mode, or select your own <code>.sfw</code> file.
                    </div>
                    <div class="recovery-source-row">
                      <button class="toggle-pill" type="button" data-command="set-recovery-source" data-recovery-source="bundled" data-selected="${state.recoverySource === "bundled"}">Bundled firmware</button>
                      <button class="toggle-pill" type="button" data-command="set-recovery-source" data-recovery-source="file" data-selected="${state.recoverySource === "file"}">Choose .sfw file</button>
                    </div>
                    ${
                      state.recoverySource === "bundled"
                        ? `
                          <div class="setting">
                            <div class="setting-head">
                              <span class="setting-label">Model</span>
                            </div>
                            <select class="number-input" data-recovery-model>
                              <option value="">Select model</option>
                              ${RECOVERY_MODELS.map(
                                (model) => `
                                  <option value="${escapeHtml(model.id)}" ${state.recoveryBundledModelId === model.id ? "selected" : ""}>${escapeHtml(shortModelLabel(model.name))}</option>
                                `,
                              ).join("")}
                            </select>
                          </div>
                          <div class="toggle-setting">
                            <div class="setting-head">
                              <span class="setting-label">Mode</span>
                            </div>
                            <div class="toggle-pills">
                              <button class="toggle-pill" type="button" data-command="set-recovery-mode" data-recovery-mode="servo_mode" data-selected="${state.recoveryBundledMode === "servo_mode"}">Servo</button>
                              <button class="toggle-pill" type="button" data-command="set-recovery-mode" data-recovery-mode="cr_mode" data-selected="${state.recoveryBundledMode === "cr_mode"}">CR</button>
                            </div>
                          </div>
                        `
                        : `
                          <div class="setting">
                            <div class="setting-head">
                              <span class="setting-label">Firmware file</span>
                            </div>
                            <div class="confirm-actions confirm-actions-left">
                              <button class="tool" type="button" data-command="pick-recovery-file">Choose .sfw file</button>
                              ${
                                state.recoveryFile
                                  ? `<span class="checkpoint-meta">${escapeHtml(state.recoveryFile.name)}</span>`
                                  : `<span class="checkpoint-meta">No file selected</span>`
                              }
                            </div>
                            ${
                              state.recoveryFileModelId
                                ? `<div class="checkpoint-meta">Detected model: ${escapeHtml(shortModelLabel(state.recoveryFileModelName ?? state.recoveryFileModelId))}</div>`
                                : ""
                            }
                          </div>
                        `
                    }
                    <div class="confirm-warning">
                      Confirm that <strong>${escapeHtml(recoverySummaryLabel || "the selected target")}</strong> is correct. Flashing the wrong firmware may irreparably damage the servo.
                    </div>
                    <div class="confirm-actions">
                      <button class="tool" type="button" data-command="cancel-recover-servo">Cancel</button>
                      <button class="apply" type="button" data-command="confirm-recover-servo" ${!recoverySelectionValid ? "disabled" : ""}>Recover Servo</button>
                    </div>
                  </div>
                </div>
              `
              : ""
          }

          ${
            emptyState === "adapter"
              ? `
                <section class="pane empty-pane">
                  <div class="empty-content">
                    <h2 class="empty-title">${state.hasAuthorizedAccess ? "Adapter not connected" : "Grant browser permission"}</h2>
                    <p class="empty-copy">${
                      state.hasAuthorizedAccess
                        ? "Please ensure the adapter is properly plugged in and available to this app. Try unplugging and replugging it."
                        : "Click Grant Permission. When the browser chooser opens, select USB Bootloader v1.3. After that, this page will poll for the adapter and servo automatically."
                    }</p>
                    ${
                      options.requestDevice
                        ? `
                          <button class="empty-action" data-command="authorize-adapter" ${state.busyAction ? "disabled" : ""}>${state.busyAction === "Connect" ? "Requesting..." : state.hasAuthorizedAccess ? "Grant Permission Again" : "Grant Permission"}</button>
                          <p class="empty-note">${
                            state.busyAction === "Connect"
                              ? "The browser chooser can take a few seconds to appear. When it opens, select USB Bootloader v1.3."
                              : state.hasAuthorizedAccess
                                ? "If the adapter does not return automatically, click Grant Permission Again and reselect USB Bootloader v1.3."
                                : "When the browser chooser opens, select USB Bootloader v1.3."
                          }</p>
                        `
                        : ""
                    }
                  </div>
                </section>
              `
              : emptyState === "servo"
                ? `
                  <section class="pane empty-pane">
                    <div class="empty-content">
                      <h2 class="empty-title">Servo not detected</h2>
                      <p class="empty-copy">Please ensure the servo is plugged into the adapter and powered correctly. Try unplugging and replugging it.</p>
                      ${
                        canRecover
                          ? `
                            <p class="empty-note">
                              If it still does not respond, you can
                              <button class="empty-link" type="button" data-command="open-recover-servo" ${state.busyAction ? "disabled" : ""}>recover your servo</button>.
                            </p>
                          `
                          : ""
                      }
                    </div>
                  </section>
                `
                : `
                  <div class="workspace">
                    <section class="pane config-pane" data-dropzone="config">
              <div class="mode-row">
                <button class="mode-button" data-mode="servo_mode" data-selected="${state.draft.mode === "servo_mode"}">Servo</button>
                <button class="mode-button" data-mode="cr_mode" data-selected="${state.draft.mode === "cr_mode"}">CR</button>
              </div>

              ${
                showRange
                  ? `
                    <div class="setting" data-setting="range">
                      <div class="setting-head">
                        <span class="setting-label">Range ${help(HELP_TEXT.range)}</span>
                        <span class="setting-value" data-range-value>${Math.round((operating.spec.maxRangeDeg * state.draft.rangePercent) / 100)} deg</span>
                      </div>
                      <input class="slider" data-slider="range" type="range" min="10" max="100" step="1" value="${state.draft.rangePercent}" />
                    </div>
                  `
                  : ""
              }

              <div class="setting" data-setting="${state.draft.mode === "servo_mode" ? "center" : "stop-trim"}">
                <div class="setting-head">
                  <span class="setting-label">${centerLabel} ${help(state.draft.mode === "servo_mode" ? HELP_TEXT.center : HELP_TEXT.stopTrim)}</span>
                  <span class="setting-value" data-neutral-value>${escapeHtml(formatSignedUs(state.draft.neutralUs))} us</span>
                </div>
                <input class="slider" data-slider="neutral" type="range" min="-127" max="127" step="1" value="${state.draft.neutralUs}" />
              </div>

              <div class="setting" data-setting="direction">
                <div class="setting-head">
                  <span class="setting-label">Direction ${help(HELP_TEXT.direction)}</span>
                  <span class="setting-value">${escapeHtml(directionLabel(state.draft.direction))}</span>
                </div>
                <div class="direction-row">
                  <button class="direction-button" data-direction="cw" data-selected="${state.draft.direction === "cw"}">CW</button>
                  <button class="direction-button" data-direction="ccw" data-selected="${state.draft.direction === "ccw"}">CCW</button>
                </div>
              </div>

              <div class="setting" data-setting="power-limit">
                <div class="setting-head">
                  <span class="setting-label">Power limit ${help(HELP_TEXT.powerLimit)}</span>
                  <span class="setting-value" data-power-limit-value>${state.draft.pwmPowerPercent.toFixed(0)} %</span>
                </div>
                <input class="slider" data-slider="power-limit" type="range" min="0" max="100" step="1" value="${state.draft.pwmPowerPercent}" />
              </div>

              ${
                showSensitivity
                  ? `
                    <div class="setting" data-setting="sensitivity">
                      <div class="setting-head">
                        <span class="setting-label">Sensitivity ${help(HELP_TEXT.sensitivity)}</span>
                        <span class="setting-value" data-sensitivity-value>${state.draft.sensitivityStep} · ${escapeHtml(sensitivityLabel(state.draft.sensitivityStep))}</span>
                      </div>
                      <input class="slider" data-slider="sensitivity" type="range" min="0" max="14" step="1" value="${state.draft.sensitivityStep}" />
                    </div>
                  `
                  : ""
              }

              ${
                showDampening
                  ? `
                    <div class="setting" data-setting="dampening">
                      <div class="setting-head">
                        <span class="setting-label">Dampening ${help(HELP_TEXT.dampening)}</span>
                        <span class="setting-value" data-dampening-value>${state.draft.dampeningFactor}</span>
                      </div>
                      <input class="number-input" data-input="dampening" type="number" min="0" max="65535" step="1" value="${state.draft.dampeningFactor}" />
                    </div>
                  `
                  : ""
              }

              ${
                showSignalLoss
                  ? `
                    <div class="setting" data-setting="signal-loss">
                      <div class="setting-head">
                        <span class="setting-label">On signal loss ${help(HELP_TEXT.signalLoss)}</span>
                      </div>
                      <div class="loss-row">
                        ${(["hold", "release", "neutral"] as const)
                          .map(
                            (loss) => `
                              <button class="loss-button" data-loss="${loss}" data-selected="${state.draft.pwmLossBehavior === loss}">
                                ${escapeHtml(lossLabel(loss))}
                              </button>
                            `,
                          )
                          .join("")}
                      </div>
                    </div>
                  `
                  : ""
              }

              ${
                showOverload
                  ? `
                    <div class="setting" data-setting="overload-protection">
                      <div class="setting-head">
                        <span class="setting-label">Load protection ${help(HELP_TEXT.overload)}</span>
                      </div>
                      <div class="toggle-pills">
                        <button class="toggle-pill" data-toggle-kind="overloadProtection" data-toggle-value="false" data-selected="${!state.draft.overloadProtectionEnabled}">Off</button>
                        <button class="toggle-pill" data-toggle-kind="overloadProtection" data-toggle-value="true" data-selected="${state.draft.overloadProtectionEnabled}">On</button>
                      </div>
                      <div class="compound-grid">
                        ${state.draft.overloadLevels
                          .map(
                            (level, index) => `
                              <div class="compound-row" data-setting="overload-level${index + 1}">
                                <div class="compound-label">L${index + 1}</div>
                                <div class="compound-inputs">
                                  <div class="unit-input" data-disabled="${!state.draft.overloadProtectionEnabled}">
                                    <input class="number-input" data-input="overload-pct-${index}" type="number" min="10" max="100" step="0.1" value="${level.pct.toFixed(1)}" ${state.draft.overloadProtectionEnabled ? "" : "disabled"} />
                                    <span class="unit-suffix">%</span>
                                  </div>
                                  <div class="unit-input" data-disabled="${!state.draft.overloadProtectionEnabled}">
                                    <input class="number-input" data-input="overload-sec-${index}" type="number" min="0" max="25.5" step="0.1" value="${level.sec.toFixed(1)}" ${state.draft.overloadProtectionEnabled ? "" : "disabled"} />
                                    <span class="unit-suffix">sec</span>
                                  </div>
                                </div>
                              </div>
                            `,
                          )
                          .join("")}
                      </div>
                    </div>
                  `
                  : ""
              }

              ${
                showSoftStart
                  ? `
                    <div class="toggle-setting" data-setting="ramp">
                      <div class="setting-head">
                        <span class="setting-label">Ramp ${help(HELP_TEXT.ramp)}</span>
                      </div>
                      <div class="toggle-pills">
                        <button class="toggle-pill" data-toggle-kind="softStart" data-toggle-value="false" data-selected="${!state.draft.softStart}">Off</button>
                        <button class="toggle-pill" data-toggle-kind="softStart" data-toggle-value="true" data-selected="${state.draft.softStart}">On</button>
                      </div>
                    </div>
                  `
                  : ""
              }

              ${
                showProptl
                  ? `
                    <div class="setting" data-setting="proptl">
                      <div class="setting-head">
                        <span class="setting-label">ProPTL ${help(HELP_TEXT.proptl)}</span>
                        <span class="setting-value" data-proptl-value>${state.draft.proptlSeconds.toFixed(1)} s</span>
                      </div>
                      <input class="slider" data-slider="proptl" type="range" min="0" max="25.5" step="0.1" value="${state.draft.proptlSeconds}" />
                    </div>
                  `
                  : ""
              }
              <input type="file" accept=".axon,.svo,application/json,.json" data-file-input hidden />
                    </section>

                    <section class="pane sim-pane">
              <div class="sim-grid">
                <div class="sim-left">
                  <div class="servo-card">
                    <div class="servo-card-figure">
                      <div data-sim-servo>
                        ${servoSketch(operating.spec, point, state.draft, operating.torqueMax)}
                      </div>
                    </div>
                    <div class="servo-card-controls">
                      <button class="servo-sweep-control" data-command="toggle-sweep" title="${
                        state.draft.mode === "servo_mode"
                          ? state.sim.sweepEnabled && state.sim.playbackRunning
                            ? "Pause sweep"
                            : "Play sweep"
                          : state.sim.playbackRunning
                            ? "Pause animation"
                            : "Play animation"
                      }" aria-label="${
                        state.draft.mode === "servo_mode"
                          ? state.sim.sweepEnabled && state.sim.playbackRunning
                            ? "Pause sweep"
                            : "Play sweep"
                          : state.sim.playbackRunning
                            ? "Pause animation"
                            : "Play animation"
                      }">${sweepControlIcon(state.sim.playbackRunning)}</button>
                    </div>
                  </div>

                  <div class="sim-sliders">
                    <div class="mini-row">
                      <div class="mini-label">${state.draft.mode === "servo_mode" ? "PWM" : "Drive"} ${help(state.draft.mode === "servo_mode" ? HELP_TEXT.pwmServo : HELP_TEXT.pwmCr)}</div>
                      <div>
                        <div class="mini-value" data-live-pwm-value>${point.pwmUs} us</div>
                        <input class="slider" data-slider="pwm" type="range" min="500" max="2500" step="10" value="${point.pwmUs}" />
                        <div class="mini-range"><span>500</span><span>1500</span><span>2500</span></div>
                      </div>
                    </div>

                    <div class="mini-row">
                      <div class="mini-label">Voltage ${help(HELP_TEXT.voltage)}</div>
                      <div>
                        <div class="mini-value" data-voltage-value>${state.sim.voltage.toFixed(1)} V</div>
                        <input class="slider" data-slider="voltage" type="range" min="4.8" max="8.4" step="0.1" value="${state.sim.voltage}" list="voltage-detents" />
                        <datalist id="voltage-detents">
                          ${voltageDetents.map((value) => `<option value="${value}"></option>`).join("")}
                        </datalist>
                        <div class="mini-range" data-voltage-detents>${voltageDetents.map((value) => `<span>${value}</span>`).join("")}</div>
                      </div>
                    </div>

                    <div class="mini-row">
                      <div class="mini-label">Load ${help(HELP_TEXT.load)}</div>
                      <div>
                        <div class="mini-value" data-load-value>${state.sim.loadKgcm.toFixed(1)} kgf*cm</div>
                        <input class="slider" data-slider="load" type="range" min="0" max="${loadSliderMax.toFixed(2)}" step="0.01" value="${state.sim.loadKgcm.toFixed(2)}" />
                        <div class="mini-range"><span>0.0</span><span data-load-max>${loadSliderMax.toFixed(1)}</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="sim-right" data-sim-charts>
                  <div data-operating-point hidden></div>
                  ${simChartsMarkup()}
                </div>
              </div>
                    </section>
                  </div>
                `
          }

          ${
            options.debugEnabled
              ? `
                <details class="debug" ${state.diagnosticsOpen ? "open" : ""}>
                  <summary><span class="debug-toggle">Diagnostics</span></summary>
                  <div class="debug-panel">
                    <pre>${escapeHtml(toPrettyJson(diagnostics))}</pre>
                  </div>
                </details>
              `
              : ""
          }
        </div>
      </div>
    `;

    options.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const previousMode = state.draft.mode;
        state.draft.mode = button.dataset.mode === "cr_mode" ? "cr_mode" : "servo_mode";
        state.sim = syncSimToDraft(
          state.draft,
          state.sim,
          lookupSpec(state.config?.modelId ?? null, state.config?.modelName ?? null, state.config),
          previousMode,
        );
        updateSweepTimer();
        render();
      });
    });

    options.root.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((button) => {
      button.addEventListener("click", () => {
        state.draft.direction = button.dataset.direction === "ccw" ? "ccw" : "cw";
        render();
      });
    });

    options.root.querySelectorAll<HTMLButtonElement>("[data-loss]").forEach((button) => {
      button.addEventListener("click", () => {
        state.draft.pwmLossBehavior =
          button.dataset.loss === "hold" || button.dataset.loss === "neutral"
            ? button.dataset.loss
            : "release";
        render();
      });
    });

    options.root.querySelectorAll<HTMLInputElement>("[data-slider]").forEach((input) => {
      input.addEventListener("input", () => {
        switch (input.dataset.slider) {
          case "range":
            state.draft.rangePercent = clamp(Number(input.value), 10, 100);
            break;
          case "sensitivity":
            state.draft.sensitivityStep = clamp(Math.round(Number(input.value)), 0, 14);
            break;
          case "neutral":
            state.draft.neutralUs = clamp(Number(input.value), -127, 127);
            break;
          case "proptl":
            state.draft.proptlSeconds = clamp(Number(input.value), 0, 25.5);
            break;
          case "power-limit":
            state.draft.pwmPowerPercent = clamp(Number(input.value), 0, 100);
            state.sim.loadKgcm = clamp(
              state.sim.loadKgcm,
              0,
              maxAvailableTorqueKgcm(
                lookupSpec(
                  state.config?.modelId ?? null,
                  state.config?.modelName ?? null,
                  state.config,
                ),
                state.sim.voltage,
                state.draft.pwmPowerPercent,
              ),
            );
            break;
          case "pwm":
            state.sim.pwmUs = clamp(Number(input.value), 500, 2500);
            if (state.draft.mode === "servo_mode") {
              state.sim.sweepEnabled = false;
              state.sim.playbackRunning = false;
            }
            break;
          case "voltage":
            state.sim.voltage = clamp(Number(input.value), 4.8, 8.4);
            state.sim.loadKgcm = clamp(
              state.sim.loadKgcm,
              0,
              maxAvailableTorqueKgcm(
                lookupSpec(
                  state.config?.modelId ?? null,
                  state.config?.modelName ?? null,
                  state.config,
                ),
                state.sim.voltage,
                state.draft.pwmPowerPercent,
              ),
            );
            break;
          case "load":
            state.sim.loadKgcm = clamp(
              Number(input.value),
              0,
              maxAvailableTorqueKgcm(
                lookupSpec(
                  state.config?.modelId ?? null,
                  state.config?.modelName ?? null,
                  state.config,
                ),
                state.sim.voltage,
                state.draft.pwmPowerPercent,
              ),
            );
            break;
          default:
            break;
        }
        updateSweepTimer();
        refreshInteractiveUi();
      });
    });

    options.root.querySelectorAll<HTMLInputElement>("[data-input]").forEach((input) => {
      const syncInput = () => {
        const key = input.dataset.input ?? "";
        if (key === "dampening") {
          state.draft.dampeningFactor = clamp(Math.round(Number(input.value) || 0), 0, 65535);
        }
        if (key.startsWith("overload-pct-")) {
          const index = Number(key.slice("overload-pct-".length));
          if (Number.isInteger(index) && state.draft.overloadLevels[index]) {
            state.draft.overloadLevels[index] = {
              ...state.draft.overloadLevels[index],
              pct: clamp(Number(input.value) || 10, 10, 100),
            };
          }
        }
        if (key.startsWith("overload-sec-")) {
          const index = Number(key.slice("overload-sec-".length));
          if (Number.isInteger(index) && state.draft.overloadLevels[index]) {
            state.draft.overloadLevels[index] = {
              ...state.draft.overloadLevels[index],
              sec: clamp(Number(input.value) || 0, 0, 25.5),
            };
          }
        }
        refreshInteractiveUi();
      };

      input.addEventListener("input", syncInput);
      input.addEventListener("change", syncInput);
    });

    options.root.querySelectorAll<HTMLButtonElement>("[data-toggle-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextValue = button.dataset.toggleValue === "true";
        if (button.dataset.toggleKind === "softStart") {
          state.draft.softStart = nextValue;
        }
        if (button.dataset.toggleKind === "overloadProtection") {
          state.draft.overloadProtectionEnabled = nextValue;
        }
        updateSweepTimer();
        render();
      });
    });

    const fileInput = options.root.querySelector<HTMLInputElement>("[data-file-input]");
    if (fileInput) {
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) {
          handleFile(file);
        }
        fileInput.value = "";
      });
    }

    const dropzone = options.root.querySelector<HTMLElement>("[data-dropzone='config']");
    if (dropzone) {
      dropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropzone.classList.add("dragging");
      });
      dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragging");
      });
      dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragging");
        const file = event.dataTransfer?.files?.[0];
        if (file) {
          handleFile(file);
        }
      });
    }

    const details = options.root.querySelector<HTMLDetailsElement>("details.debug");
    if (details) {
      details.addEventListener("toggle", () => {
        state.diagnosticsOpen = details.open;
      });
    }

    options.root.querySelectorAll<HTMLElement>("[data-help]").forEach((element) => {
      element.addEventListener("mouseenter", () => {
        showHelpTooltip(element);
      });
      element.addEventListener("mouseleave", () => {
        hideHelpTooltip();
      });
      element.addEventListener("focus", () => {
        showHelpTooltip(element);
      });
      element.addEventListener("blur", () => {
        hideHelpTooltip();
      });
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });

    options.root.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
      button.addEventListener("click", () => {
        const command = button.dataset.command;
        if (command === "authorize-adapter") void doAuthorizeAndConnect();
        if (command === "toggle-sweep") {
          if (state.draft.mode === "servo_mode") {
            if (!state.sim.sweepEnabled) {
              state.sim.sweepEnabled = true;
              state.sim.playbackRunning = true;
              state.sim.servoSweepPhase = 0;
            } else {
              state.sim.playbackRunning = !state.sim.playbackRunning;
            }
          } else {
            state.sim.playbackRunning = !state.sim.playbackRunning;
          }
          updateSweepTimer();
          refreshInteractiveUi();
        }
        if (command === "toggle-status-log") {
          state.statusOpen = !state.statusOpen;
          render();
        }
        if (command === "toggle-file-menu") {
          state.loadPanelOpen = !state.loadPanelOpen;
          render();
        }
        if (command === "copy-status-log") {
          const text = logger.snapshot();
          void navigator.clipboard.writeText(text).then(
            () => {
              setStatus("Log copied");
              if (state.statusOpen) render();
            },
            () => {
              reportError("Could not copy log.");
              render();
            },
          );
        }
        if (command === "close-load-panel") {
          state.loadPanelOpen = false;
          render();
        }
        if (command === "load-file") {
          state.loadPanelOpen = false;
          void promptLoadFile(fileInput);
        }
        if (command === "load-checkpoint") {
          const checkpointId = button.dataset.checkpointId;
          if (checkpointId) {
            loadCheckpoint(checkpointId);
          }
        }
        if (command === "save-axon") {
          state.loadPanelOpen = false;
          void triggerSave("axon");
        }
        if (command === "save-svo") {
          state.loadPanelOpen = false;
          void triggerSave("svo");
        }
        if (command === "open-recover-servo") {
          openRecoveryWizard();
          render();
        }
        if (command === "set-recovery-source") {
          state.recoverySource = button.dataset.recoverySource === "file" ? "file" : "bundled";
          render();
        }
        if (command === "set-recovery-mode") {
          state.recoveryBundledMode =
            button.dataset.recoveryMode === "cr_mode" ? "cr_mode" : "servo_mode";
          render();
        }
        if (command === "pick-recovery-file") {
          void promptRecoveryFirmware();
        }
        if (command === "cancel-recover-servo") {
          state.recoveryConfirmOpen = false;
          render();
        }
        if (command === "confirm-recover-servo") {
          void recoverServo();
        }
        if (command === "discard") {
          void discardToServo();
        }
        if (command === "apply") {
          void applyToServo();
        }
      });
    });

    const recoveryModelSelect =
      options.root.querySelector<HTMLSelectElement>("[data-recovery-model]");
    if (recoveryModelSelect) {
      recoveryModelSelect.addEventListener("change", () => {
        state.recoveryBundledModelId = recoveryModelSelect.value;
        render();
      });
    }

    if (state.loadPanelOpen) {
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        const menu = options.root.querySelector<HTMLElement>(".top-menu");
        if (menu && !menu.contains(target)) {
          state.loadPanelOpen = false;
          render();
        }
      };
      window.setTimeout(() => {
        window.addEventListener("pointerdown", onPointerDown, { once: true });
      }, 0);
    }

    const statusLogList = options.root.querySelector<HTMLElement>(".status-log-list");
    if (statusLogList) {
      if (statusLogPinnedToBottom) {
        statusLogList.scrollTop = statusLogList.scrollHeight;
      } else {
        statusLogList.scrollTop = statusLogScrollTop;
      }
      statusLogList.addEventListener("scroll", () => {
        statusLogScrollTop = statusLogList.scrollTop;
        statusLogPinnedToBottom =
          statusLogList.scrollTop + statusLogList.clientHeight >= statusLogList.scrollHeight - 8;
      });
    }

    renderSweepFrame(true);
  }

  async function bootstrap(): Promise<void> {
    setStatus("Starting");
    render();
    try {
      const [environment, inventory] = await Promise.all([
        options.loadEnvironment(),
        options.loadInventory(),
      ]);
      state.environment = environment;
      updateInventory(inventory);
      if (options.autoConnectOnLoad && inventory.devices.length > 0) {
        await doConnectAndSync(false);
      } else {
        setIdleStatus();
      }
    } catch (error) {
      reportError(error);
    }
    if (options.watchInventory) {
      options.watchInventory((inventory) => {
        const changed = updateInventory(inventory);
        if (
          options.autoConnectOnLoad &&
          inventory.devices.length > 0 &&
          !inventory.openedId &&
          !state.busyAction
        ) {
          void doConnectAndSync(false);
          return;
        }
        if (changed) {
          render();
        }
      });
    }
    if (options.subscribeTransportLog) {
      _transportLogCleanup = options.subscribeTransportLog((message) => {
        logger.debug(message);
        if (state.statusOpen) {
          render();
        }
      });
    }
    if (options.subscribeStatusLog) {
      _statusLogCleanup = options.subscribeStatusLog((message) => {
        logger.status(message);
        if (state.statusOpen) {
          render();
        }
      });
    }
    updateLivePollTimer();
    updateSweepTimer();
    window.addEventListener("resize", handleResize);
    render();
  }

  void bootstrap();
}
