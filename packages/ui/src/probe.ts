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

type ServoMode = "servo_mode" | "cr_mode";
type LossBehavior = "release" | "hold" | "neutral";
type Direction = "cw" | "ccw";

interface ProfilePreset {
  id: string;
  label: string;
  mode: ServoMode;
  rangePercent: number;
  neutralUs: number;
  direction: Direction;
  pwmLossBehavior: LossBehavior;
  softStart: boolean;
  pwmUs: number;
}

interface DraftSetup {
  profileId: string;
  mode: ServoMode;
  rangePercent: number;
  neutralUs: number;
  direction: Direction;
  pwmLossBehavior: LossBehavior;
  softStart: boolean;
  pwmUs: number;
  voltage: number;
  loadKgcm: number;
  sweepEnabled: boolean;
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
  loadPanelOpen: boolean;
  sweepPhase: number;
}

type EmptyStateKind = "adapter" | "servo" | null;

interface VoltagePoint {
  voltage: number;
  torqueKgcm: number;
  speedSec60: number;
  idleA: number;
  stallA: number;
}

interface ServoSpec {
  bodyWidth: number;
  bodyHeight: number;
  axisInsetY: number;
  maxRangeDeg: number;
  points: VoltagePoint[];
}

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
  sweepDirection: 1 | -1;
}

const PROFILE_PRESETS: ProfilePreset[] = [
  {
    id: "claw",
    label: "Claw",
    mode: "servo_mode",
    rangePercent: 30,
    neutralUs: 0,
    direction: "cw",
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
    direction: "cw",
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
    direction: "ccw",
    pwmLossBehavior: "neutral",
    softStart: true,
    pwmUs: 1700,
  },
  {
    id: "arm",
    label: "Arm",
    mode: "servo_mode",
    rangePercent: 55,
    neutralUs: 10,
    direction: "cw",
    pwmLossBehavior: "hold",
    softStart: true,
    pwmUs: 1850,
  },
];

const MINI_SPEC: ServoSpec = {
  bodyWidth: 130,
  bodyHeight: 236,
  axisInsetY: 44,
  maxRangeDeg: 355,
  points: [
    { voltage: 4.8, torqueKgcm: 13, speedSec60: 0.16, idleA: 0.14, stallA: 2.2 },
    { voltage: 6.0, torqueKgcm: 16, speedSec60: 0.13, idleA: 0.17, stallA: 2.6 },
    { voltage: 7.4, torqueKgcm: 19, speedSec60: 0.11, idleA: 0.19, stallA: 3.0 },
    { voltage: 8.4, torqueKgcm: 21, speedSec60: 0.1, idleA: 0.21, stallA: 3.2 },
  ],
};

const MICRO_SPEC: ServoSpec = {
  bodyWidth: 112,
  bodyHeight: 214,
  axisInsetY: 40,
  maxRangeDeg: 360,
  points: [
    { voltage: 4.8, torqueKgcm: 4.2, speedSec60: 0.16, idleA: 0.1, stallA: 1.0 },
    { voltage: 6.0, torqueKgcm: 5.2, speedSec60: 0.13, idleA: 0.12, stallA: 1.3 },
    { voltage: 7.4, torqueKgcm: 6.5, speedSec60: 0.11, idleA: 0.14, stallA: 1.6 },
    { voltage: 8.4, torqueKgcm: 7.1, speedSec60: 0.1, idleA: 0.16, stallA: 1.8 },
  ],
};

const MAX_SPEC: ServoSpec = {
  bodyWidth: 144,
  bodyHeight: 246,
  axisInsetY: 46,
  maxRangeDeg: 360,
  points: [
    { voltage: 4.8, torqueKgcm: 28, speedSec60: 0.14, idleA: 0.28, stallA: 3.6 },
    { voltage: 6.0, torqueKgcm: 34, speedSec60: 0.115, idleA: 0.32, stallA: 4.0 },
    { voltage: 7.2, torqueKgcm: 39, speedSec60: 0.1, idleA: 0.36, stallA: 4.3 },
    { voltage: 8.4, torqueKgcm: 45, speedSec60: 0.085, idleA: 0.4, stallA: 4.6 },
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

function modeLabel(mode: ServoMode): string {
  return mode === "cr_mode" ? "CR" : "Servo";
}

function lossLabel(loss: LossBehavior): string {
  if (loss === "release") return "Release";
  if (loss === "hold") return "Hold";
  return "Neutral";
}

function directionLabel(direction: Direction): string {
  return direction === "cw" ? "CW" : "CCW";
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
    direction: profile.direction,
    pwmLossBehavior: profile.pwmLossBehavior,
    softStart: profile.softStart,
    pwmUs: profile.pwmUs,
    voltage: 6,
    loadKgcm: profile.mode === "cr_mode" ? 4 : 6,
    sweepEnabled: profile.mode === "servo_mode",
  };
}

function modeFromConfig(config: ProbeConfigInfo | null): ServoMode {
  return config?.mode === "cr_mode" ? "cr_mode" : "servo_mode";
}

function draftFromConfig(config: ProbeConfigInfo | null, current: DraftSetup): DraftSetup {
  if (!config?.setup) return current;
  const mode = modeFromConfig(config);
  const profileId = mode === "cr_mode" ? "intake" : "claw";
  return {
    ...current,
    profileId,
    mode,
    rangePercent: clamp(config.setup.rangePercent ?? current.rangePercent, 10, 100),
    neutralUs: clamp(config.setup.neutralUs ?? current.neutralUs, -127, 127),
    direction: config.setup.inversion === "reversed" ? "ccw" : "cw",
    pwmLossBehavior:
      config.setup.pwmLossBehavior === "hold" || config.setup.pwmLossBehavior === "neutral"
        ? config.setup.pwmLossBehavior
        : "release",
    softStart: config.setup.softStart ?? current.softStart,
    sweepEnabled: mode === "servo_mode",
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
    direction: profile.direction,
    pwmLossBehavior: profile.pwmLossBehavior,
    softStart: profile.softStart,
    pwmUs: profile.pwmUs,
    loadKgcm: profile.mode === "cr_mode" ? 4 : 6,
    sweepEnabled: profile.mode === "servo_mode",
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
  if (config?.setup?.rangeDegrees && config.setup.rangeDegrees > MINI_SPEC.maxRangeDeg) {
    return {
      ...MINI_SPEC,
      maxRangeDeg: config.setup.rangeDegrees,
    };
  }
  return MINI_SPEC;
}

function nearlyEqual(a: number, b: number, epsilon = 1): boolean {
  return Math.abs(a - b) <= epsilon;
}

function isDirty(config: ProbeConfigInfo | null, draft: DraftSetup): boolean {
  if (!config?.setup) return false;
  const configDirection = config.setup.inversion === "reversed" ? "ccw" : "cw";
  const configLoss =
    config.setup.pwmLossBehavior === "hold" || config.setup.pwmLossBehavior === "neutral"
      ? config.setup.pwmLossBehavior
      : "release";
  return (
    config.mode !== draft.mode ||
    !nearlyEqual(config.setup.rangePercent ?? draft.rangePercent, draft.rangePercent) ||
    !nearlyEqual(config.setup.neutralUs ?? draft.neutralUs, draft.neutralUs) ||
    configDirection !== draft.direction ||
    configLoss !== draft.pwmLossBehavior ||
    (config.setup.softStart ?? false) !== draft.softStart
  );
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function help(title: string): string {
  return `<span class="help" title="${escapeHtml(title)}">?</span>`;
}

function formatSignedUs(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function triangleWave(phase: number): number {
  const wrapped = phase % 2;
  return wrapped <= 1 ? wrapped : 2 - wrapped;
}

function effectivePwm(draft: DraftSetup, sweepPhase: number): number {
  if (draft.mode === "servo_mode" && draft.sweepEnabled) {
    return Math.round(500 + 2000 * triangleWave(sweepPhase));
  }
  return draft.pwmUs;
}

function buildOperatingPoint(
  config: ProbeConfigInfo | null,
  draft: DraftSetup,
  sweepPhase: number,
): {
  spec: ServoSpec;
  base: VoltagePoint;
  point: OperatingPoint;
  curves: CurvePoint[];
  torqueMax: number;
  noLoadRpm: number;
} {
  const spec = lookupSpec(config?.modelId ?? null, config?.modelName ?? null, config);
  const base = interpolatePoint(spec.points, draft.voltage);
  const noLoadRpm = rpmFromSec60(base.speedSec60);
  const pwmPowerLimit = clamp((config?.setup?.pwmPowerPercent ?? 85) / 100, 0.2, 1);
  const torqueMax = Math.max(0.1, base.torqueKgcm * pwmPowerLimit);
  const currentPwmUs = effectivePwm(draft, sweepPhase);
  const centeredPwm = 1500 + draft.neutralUs;
  const command = clamp((currentPwmUs - centeredPwm) / 1000, -1, 1);
  const signedCommand = draft.direction === "cw" ? command : -command;
  const rangeDeg = (spec.maxRangeDeg * draft.rangePercent) / 100;
  const minAngleDeg = -rangeDeg / 2;
  const maxAngleDeg = rangeDeg / 2;
  const hornAngleDeg =
    draft.mode === "servo_mode"
      ? clamp(signedCommand * (rangeDeg / 2), minAngleDeg, maxAngleDeg)
      : signedCommand * 18;

  const torqueKgcm = clamp(draft.loadKgcm, 0, torqueMax);
  const torqueRatio = clamp(torqueKgcm / torqueMax, 0, 1);
  const currentA = base.idleA + (base.stallA - base.idleA) * torqueRatio;
  const currentRpm = Math.max(0, noLoadRpm * (1 - torqueRatio));
  const mechanicalPowerW = kgcmToNm(torqueKgcm) * ((currentRpm * 2 * Math.PI) / 60);
  const electricalPowerW = draft.voltage * currentA;
  const heatW = Math.max(0, electricalPowerW - mechanicalPowerW);
  const efficiency = electricalPowerW > 0 ? mechanicalPowerW / electricalPowerW : 0;

  const curves: CurvePoint[] = [];
  for (let index = 0; index <= 48; index++) {
    const sampleTorque = (torqueMax * index) / 48;
    const sampleRatio = clamp(sampleTorque / torqueMax, 0, 1);
    const sampleCurrentA = base.idleA + (base.stallA - base.idleA) * sampleRatio;
    const sampleSpeedRpm = Math.max(0, noLoadRpm * (1 - sampleRatio));
    const sampleMechanicalPowerW = kgcmToNm(sampleTorque) * ((sampleSpeedRpm * 2 * Math.PI) / 60);
    const sampleElectricalPowerW = draft.voltage * sampleCurrentA;
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
      sweepDirection: draft.direction === "cw" ? 1 : -1,
    },
  };
}

function svgPathFromSeries(
  values: CurvePoint[],
  xValue: (point: CurvePoint) => number,
  yValue: (point: CurvePoint) => number,
  xMax: number,
  yMax: number,
  width: number,
  height: number,
): string {
  return values
    .map((point, index) => {
      const x = (xValue(point) / xMax) * width;
      const y = height - (yValue(point) / yMax) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function chartDiamond(x: number, y: number, tooltip: string, color = "#5aa5ff"): string {
  const size = 8;
  return `
    <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <title>${escapeHtml(tooltip)}</title>
      <path d="M 0 -${size} L ${size} 0 L 0 ${size} L -${size} 0 Z" fill="${color}" stroke="#2d78d0" stroke-width="1.5" />
    </g>
  `;
}

function formatOperatingTooltip(
  point: OperatingPoint,
  kind: "speed" | "current" | "power" | "efficiency",
): string {
  const lines = [
    `Torque: ${point.torqueKgcm.toFixed(1)} kgf*cm`,
    `Torque: ${kgcmToNm(point.torqueKgcm).toFixed(2)} N*m`,
    `Torque: ${kgcmToOzIn(point.torqueKgcm).toFixed(1)} oz*in`,
  ];

  if (kind === "speed") {
    lines.push(`Speed: ${point.speedRpm.toFixed(0)} rpm`);
    lines.push(`Speed: ${(point.speedRpm * 6).toFixed(0)} deg/s`);
  }
  if (kind === "current") {
    lines.push(`Current: ${point.currentA.toFixed(2)} A`);
    lines.push(`Electrical power: ${point.electricalPowerW.toFixed(1)} W`);
  }
  if (kind === "power") {
    lines.push(`Mechanical power: ${point.mechanicalPowerW.toFixed(1)} W`);
    lines.push(`Heat: ${point.heatW.toFixed(1)} W`);
  }
  if (kind === "efficiency") {
    lines.push(`Efficiency: ${(point.efficiency * 100).toFixed(0)} %`);
    lines.push(`Mechanical power: ${point.mechanicalPowerW.toFixed(1)} W`);
    lines.push(`Electrical power: ${point.electricalPowerW.toFixed(1)} W`);
    lines.push(`Heat: ${point.heatW.toFixed(1)} W`);
  }

  return lines.join("\n");
}

function lineChart(
  title: string,
  subtitle: string,
  xMax: number,
  leftMax: number,
  rightMax: number | null,
  primaryPath: string,
  secondaryPath: string | null,
  operatingX: number,
  primaryY: number,
  secondaryY: number | null,
  primaryTooltip: string,
  secondaryTooltip: string | null,
  leftLabel: string,
  rightLabel: string | null,
): string {
  const width = 280;
  const height = 120;
  const x = (operatingX / xMax) * width;

  return `
    <div class="chart-card">
      <div class="chart-head">
        <span>${escapeHtml(title)}</span>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <svg viewBox="0 0 320 152" class="chart-svg" aria-label="${escapeHtml(title)}">
        <line x1="28" y1="8" x2="28" y2="128" stroke="#3c7ce7" stroke-width="1.6" />
        <line x1="28" y1="128" x2="308" y2="128" stroke="#111111" stroke-width="1.2" />
        ${rightLabel ? `<line x1="308" y1="8" x2="308" y2="128" stroke="#3c7ce7" stroke-width="1.6" />` : ""}
        <line x1="${(28 + x).toFixed(1)}" y1="8" x2="${(28 + x).toFixed(1)}" y2="128" stroke="#88bfff" stroke-width="1.2" stroke-dasharray="4 8" />
        <path d="${primaryPath}" fill="none" stroke="#111111" stroke-width="2.2" transform="translate(28 8)" />
        ${secondaryPath ? `<path d="${secondaryPath}" fill="none" stroke="#ff3a38" stroke-width="2.2" transform="translate(28 8)" />` : ""}
        ${chartDiamond(28 + x, 8 + (height - (primaryY / leftMax) * height), primaryTooltip)}
        ${
          secondaryY != null && rightLabel != null && rightMax
            ? chartDiamond(
                28 + x,
                8 + (height - (secondaryY / rightMax) * height),
                secondaryTooltip ?? "",
              )
            : ""
        }
        <text x="28" y="145" class="chart-axis">0</text>
        <text x="308" y="145" text-anchor="end" class="chart-axis">${xMax.toFixed(1)}</text>
        <text x="22" y="24" text-anchor="end" class="chart-axis">${leftMax.toFixed(0)}</text>
        ${rightLabel && rightMax ? `<text x="314" y="24" class="chart-axis">${rightMax.toFixed(1)}</text>` : ""}
        <text x="10" y="74" transform="rotate(-90 10 74)" class="chart-label">${escapeHtml(leftLabel)}</text>
        ${
          rightLabel
            ? `<text x="318" y="74" transform="rotate(-90 318 74)" class="chart-label">${escapeHtml(rightLabel)}</text>`
            : ""
        }
        <text x="165" y="150" text-anchor="middle" class="chart-label">torque (kgf*cm)</text>
      </svg>
    </div>
  `;
}

function powerChart(
  title: string,
  xMax: number,
  yMax: number,
  path: string,
  operatingX: number,
  operatingY: number,
  tooltip: string,
  yLabel: string,
): string {
  const width = 280;
  const height = 120;
  const x = (operatingX / xMax) * width;
  const y = 8 + (height - (operatingY / yMax) * height);
  return `
    <div class="chart-card">
      <div class="chart-head">
        <span>${escapeHtml(title)}</span>
      </div>
      <svg viewBox="0 0 320 152" class="chart-svg" aria-label="${escapeHtml(title)}">
        <line x1="28" y1="8" x2="28" y2="128" stroke="#3c7ce7" stroke-width="1.6" />
        <line x1="28" y1="128" x2="308" y2="128" stroke="#111111" stroke-width="1.2" />
        <line x1="${(28 + x).toFixed(1)}" y1="8" x2="${(28 + x).toFixed(1)}" y2="128" stroke="#88bfff" stroke-width="1.2" stroke-dasharray="4 8" />
        <path d="${path}" fill="none" stroke="#8fc2f8" stroke-width="3" transform="translate(28 8)" />
        ${chartDiamond(28 + x, y, tooltip)}
        <text x="28" y="145" class="chart-axis">0</text>
        <text x="308" y="145" text-anchor="end" class="chart-axis">${xMax.toFixed(1)}</text>
        <text x="22" y="24" text-anchor="end" class="chart-axis">${yMax.toFixed(1)}</text>
        <text x="10" y="74" transform="rotate(-90 10 74)" class="chart-label">${escapeHtml(yLabel)}</text>
        <text x="165" y="150" text-anchor="middle" class="chart-label">torque (kgf*cm)</text>
      </svg>
    </div>
  `;
}

function servoSketch(spec: ServoSpec, point: OperatingPoint, draft: DraftSetup): string {
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
  const minLineEndX = axisX + Math.sin((point.minAngleDeg * Math.PI) / 180) * sweepRadius;
  const minLineEndY = axisY - Math.cos((point.minAngleDeg * Math.PI) / 180) * sweepRadius;
  const maxLineEndX = axisX + Math.sin((point.maxAngleDeg * Math.PI) / 180) * sweepRadius;
  const maxLineEndY = axisY - Math.cos((point.maxAngleDeg * Math.PI) / 180) * sweepRadius;
  const hornEndX = axisX + Math.sin((point.hornAngleDeg * Math.PI) / 180) * armLength;
  const hornEndY = axisY - Math.cos((point.hornAngleDeg * Math.PI) / 180) * armLength;

  return `
    <svg viewBox="0 0 ${width} ${height}" class="servo-svg" aria-label="servo operating sketch">
      <defs>
        <marker id="dir-head" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#b9bbc0" />
        </marker>
      </defs>
      <path d="${directionArc}" fill="none" stroke="#b9bbc0" stroke-width="4" stroke-linecap="round" marker-end="url(#dir-head)" />
      <line x1="${axisX}" y1="${axisY}" x2="${minLineEndX.toFixed(1)}" y2="${minLineEndY.toFixed(1)}" stroke="#25a244" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 14" />
      <line x1="${axisX}" y1="${axisY}" x2="${maxLineEndX.toFixed(1)}" y2="${maxLineEndY.toFixed(1)}" stroke="#ff3a38" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 14" />
      <rect x="${bodyX}" y="${bodyY}" width="${spec.bodyWidth}" height="${spec.bodyHeight}" rx="28" ry="28" fill="#ffffff" stroke="#111111" stroke-width="2" />
      <line x1="${axisX}" y1="${axisY}" x2="${hornEndX.toFixed(1)}" y2="${hornEndY.toFixed(1)}" stroke="#1f6ed4" stroke-width="8" stroke-linecap="round" />
      <circle cx="${axisX}" cy="${axisY}" r="17" fill="#ffffff" stroke="#111111" stroke-width="2" />
      <circle cx="${axisX}" cy="${axisY}" r="5" fill="${draft.direction === "cw" ? "#25a244" : "#ff3a38"}" />
      <text x="${axisX}" y="${axisY + 36}" text-anchor="middle" fill="#7eb4f5" font-size="18" font-weight="700">${point.hornAngleDeg.toFixed(0)} deg</text>
    </svg>
  `;
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
    loadPanelOpen: false,
    sweepPhase: 0,
  };

  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  function log(message: string): void {
    state.logs.unshift({ timestamp: nowLabel(), message });
    state.logs = state.logs.slice(0, 16);
  }

  function updateInventory(inventory: ProbeInventory): void {
    state.inventory = inventory;
    if (!inventory.openedId) {
      state.identify = null;
      state.config = null;
    }
  }

  function applyConfig(config: ProbeConfigInfo): void {
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
    state.loadPanelOpen = false;
    state.sweepPhase = 0;
    updateSweepTimer();
  }

  function updateSweepTimer(): void {
    const shouldRun = state.draft.mode === "servo_mode" && state.draft.sweepEnabled;
    if (shouldRun && !sweepTimer) {
      sweepTimer = setInterval(() => {
        state.sweepPhase = (state.sweepPhase + 0.04) % 2;
        render();
      }, 90);
    }
    if (!shouldRun && sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }

  async function doSync(): Promise<void> {
    if (state.busyAction) return;
    state.busyAction = "Sync";
    state.error = null;
    render();
    try {
      if (options.identifyServo) {
        const identifyReply = await options.identifyServo.run();
        state.identify = identifyReply;
        if (!identifyReply.present) {
          state.config = null;
          log("Servo not detected");
          return;
        }
      }

      if (!options.readFullConfig) {
        log("Sync");
        return;
      }

      const config = await options.readFullConfig.run();
      applyConfig(config);
      log("Sync");
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      log("Sync failed");
    } finally {
      state.busyAction = null;
      render();
    }
  }

  async function doConnectAndSync(): Promise<void> {
    if (state.busyAction) return;
    state.busyAction = "Connect";
    state.error = null;
    render();
    try {
      if (!state.inventory.openedId) {
        if (!state.inventory.devices.length && options.reconnectDevice) {
          updateInventory(await options.reconnectDevice.run());
        }
        if (!state.inventory.devices.length && options.requestDevice) {
          updateInventory(await options.requestDevice.run());
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
          updateInventory(await options.openDevice.run());
        }
      }

      if (!state.inventory.openedId) {
        throw new Error("Adapter not connected. Please unplug and replug it, then try again.");
      }

      if (options.identifyServo) {
        const identifyReply = await options.identifyServo.run();
        state.identify = identifyReply;
        if (!identifyReply.present) {
          state.config = null;
          log("Servo not detected");
          return;
        }
      }

      if (options.readFullConfig) {
        const config = await options.readFullConfig.run();
        applyConfig(config);
      }

      log("Connected");
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      log("Connect failed");
    } finally {
      state.busyAction = null;
      render();
    }
  }

  function triggerSave(): void {
    const payload = {
      kind: "axon-sim-draft",
      version: 1,
      savedAt: new Date().toISOString(),
      draft: state.draft,
      modelId: state.config?.modelId ?? null,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `axon-${state.config?.modelId ?? "draft"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    log("Save");
  }

  function applyLoadedDraft(value: unknown): void {
    if (!value || typeof value !== "object") {
      throw new Error("Unsupported file format.");
    }
    const payload = value as { draft?: Partial<DraftSetup> };
    if (!payload.draft) {
      throw new Error("Missing draft payload.");
    }

    state.draft = {
      ...state.draft,
      ...payload.draft,
      mode: payload.draft.mode === "cr_mode" ? "cr_mode" : "servo_mode",
      direction: payload.draft.direction === "ccw" ? "ccw" : "cw",
      pwmLossBehavior:
        payload.draft.pwmLossBehavior === "hold" || payload.draft.pwmLossBehavior === "neutral"
          ? payload.draft.pwmLossBehavior
          : "release",
      sweepEnabled:
        payload.draft.sweepEnabled !== undefined
          ? Boolean(payload.draft.sweepEnabled)
          : state.draft.mode === "servo_mode",
      profileId:
        typeof payload.draft.profileId === "string"
          ? payload.draft.profileId
          : state.draft.profileId,
      rangePercent: clamp(Number(payload.draft.rangePercent ?? state.draft.rangePercent), 10, 100),
      neutralUs: clamp(Number(payload.draft.neutralUs ?? state.draft.neutralUs), -127, 127),
      pwmUs: clamp(Number(payload.draft.pwmUs ?? state.draft.pwmUs), 500, 2500),
      voltage: clamp(Number(payload.draft.voltage ?? state.draft.voltage), 4.8, 8.4),
      loadKgcm: clamp(Number(payload.draft.loadKgcm ?? state.draft.loadKgcm), 0, 999),
    };
    state.loadPanelOpen = false;
    state.sweepPhase = 0;
    updateSweepTimer();
    render();
    log("Load");
  }

  function handleFile(file: File): void {
    const reader = new FileReader();
    reader.onerror = () => {
      state.error = "Could not read file.";
      render();
    };
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ""));
        applyLoadedDraft(parsed);
      } catch (error) {
        state.error = error instanceof Error ? error.message : String(error);
        render();
      }
    };
    reader.readAsText(file);
  }

  function render(): void {
    const connected = Boolean(state.inventory.openedId);
    const visible = state.inventory.devices.length > 0;
    const servoPresent = state.identify?.present ?? Boolean(state.config);
    const dirty = isDirty(state.config, state.draft);
    const servoLabel =
      state.config?.modelName ??
      (servoPresent ? (state.config?.modelId ?? "Detected") : "Not Found");
    const canDiscard = dirty && Boolean(state.config) && !state.busyAction;
    const emptyState: EmptyStateKind = !connected ? "adapter" : !servoPresent ? "servo" : null;

    const operating = buildOperatingPoint(state.config, state.draft, state.sweepPhase);
    const voltageDetents = Array.from(
      new Set(operating.spec.points.map((sample) => sample.voltage.toFixed(1))),
    );
    const point = operating.point;
    const xMax = operating.torqueMax;
    const speedMax = Math.max(1, operating.noLoadRpm);
    const currentMax = Math.max(0.1, operating.base.stallA);
    const powerMax = Math.max(0.1, ...operating.curves.map((curve) => curve.mechanicalPowerW));
    const efficiencyMax = 1;

    const speedPath = svgPathFromSeries(
      operating.curves,
      (curve) => curve.torqueKgcm,
      (curve) => curve.speedRpm,
      xMax,
      speedMax,
      280,
      120,
    );
    const currentPath = svgPathFromSeries(
      operating.curves,
      (curve) => curve.torqueKgcm,
      (curve) => curve.currentA,
      xMax,
      currentMax,
      280,
      120,
    );
    const powerPath = svgPathFromSeries(
      operating.curves,
      (curve) => curve.torqueKgcm,
      (curve) => curve.mechanicalPowerW,
      xMax,
      powerMax,
      280,
      120,
    );
    const efficiencyPath = svgPathFromSeries(
      operating.curves,
      (curve) => curve.torqueKgcm,
      (curve) => curve.efficiency,
      xMax,
      efficiencyMax,
      280,
      120,
    );

    const diagnostics = {
      environment: state.environment,
      inventory: state.inventory,
      identify: state.identify,
      config: state.config,
      draft: state.draft,
      point,
      logs: state.logs,
    };

    options.root.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; }
        :root { color-scheme: light; }

        .shell {
          min-height: 100vh;
          padding: 12px;
          background: #f8f8f6;
          color: #111111;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .frame {
          max-width: 1480px;
          margin: 0 auto;
        }

        .topline {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          margin-bottom: 12px;
          padding: 8px 10px;
          border-radius: 8px;
          background: #161616;
          color: #f7f7f7;
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
          grid-template-columns: repeat(2, minmax(0, 220px));
          gap: 8px;
        }

        .actions {
          display: inline-flex;
          gap: 8px;
          align-items: center;
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

        .workspace {
          display: grid;
          grid-template-columns: minmax(280px, 1fr) minmax(0, 2fr);
          gap: 12px;
        }

        .pane {
          border: 1px solid #dcded9;
          border-radius: 8px;
          background: #ffffff;
          overflow: hidden;
        }

        .config-pane {
          position: relative;
          padding: 14px;
          display: grid;
          gap: 14px;
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
        .load-save-button,
        .profile-chip {
          min-height: 42px;
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
        .loss-button[data-selected="true"],
        .profile-chip[data-selected="true"] {
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
          border-radius: 999px;
          border: 1px solid #ccd2d9;
          color: #737c89;
          font-size: 11px;
          line-height: 1;
          cursor: help;
        }

        .slider {
          width: 100%;
          margin: 0;
          accent-color: #1f6ed4;
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
          min-height: 42px;
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

        .load-save-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .drop-hint {
          margin-top: -4px;
          color: #95a0ae;
          font-size: 11px;
          text-align: center;
        }

        .load-panel {
          padding: 10px;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          background: #f7f9fb;
          display: grid;
          gap: 8px;
        }

        .profile-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .sim-pane {
          padding: 14px;
          display: grid;
          gap: 12px;
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

        .sim-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        .sim-left {
          display: grid;
          gap: 12px;
        }

        .sim-right {
          display: grid;
          gap: 12px;
        }

        .servo-card {
          padding: 14px;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfbf9 100%);
          display: flex;
          justify-content: center;
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
        }

        .chart-head {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
          color: #9aa3af;
          font-size: 11px;
          font-weight: 600;
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
          justify-content: center;
        }

        details.debug > summary::-webkit-details-marker {
          display: none;
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

        @media (max-width: 1160px) {
          .workspace,
          .sim-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .shell {
            padding: 10px;
          }

          .topline {
            grid-template-columns: 1fr;
          }

          .statebar,
          .profile-grid,
          .loss-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .mode-row,
          .direction-row,
          .load-save-row,
          .toggle-pills,
          .mini-row {
            grid-template-columns: 1fr;
          }
        }
      </style>
      <div class="shell">
        <div class="frame">
          <div class="topline">
            <div class="statebar">
              <div class="state ${connected ? "ok" : visible ? "warn" : ""}" title="Adapter state">
                <span class="state-label"><span class="state-dot"></span>Adapter</span>
                <span class="state-value">${connected ? "Connected" : "Not Connected"}</span>
              </div>
              <div class="state ${servoPresent ? "ok" : connected ? "warn" : ""}" title="Servo state">
                <span class="state-label"><span class="state-dot"></span>Servo</span>
                <span class="state-value">${escapeHtml(servoLabel)}</span>
              </div>
            </div>
            <div class="actions">
              <button class="tool" data-command="discard" ${!canDiscard ? "disabled" : ""} title="Re-read the servo and discard unsaved changes.">Discard</button>
              <button class="apply" data-command="apply" ${!dirty || !state.config ? "disabled" : ""} title="Make the attached servo match the sim. Not wired yet.">Apply</button>
            </div>
          </div>

          ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}

          ${
            emptyState === "adapter"
              ? `
                <section class="pane empty-pane">
                  <div class="empty-content">
                    <h2 class="empty-title">Adapter not connected</h2>
                    <p class="empty-copy">Please ensure the adapter is properly plugged in and available to this app. Try unplugging and replugging it.</p>
                    <button class="empty-action" data-command="connect-adapter" ${state.busyAction ? "disabled" : ""}>Connect Adapter</button>
                  </div>
                </section>
              `
              : emptyState === "servo"
                ? `
                  <section class="pane empty-pane">
                    <div class="empty-content">
                      <h2 class="empty-title">Servo not detected</h2>
                      <p class="empty-copy">Please ensure the servo is plugged into the adapter and powered correctly. Try unplugging and replugging it.</p>
                      <button class="empty-action" data-command="retry-servo" ${state.busyAction ? "disabled" : ""}>Try Again</button>
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

              <div class="setting">
                <div class="setting-head">
                  <span class="setting-label">Range ${help("Active sweep from the green limit to the red limit.")}</span>
                  <span class="setting-value">${Math.round((operating.spec.maxRangeDeg * state.draft.rangePercent) / 100)} deg</span>
                </div>
                <input class="slider" data-slider="range" type="range" min="10" max="100" step="1" value="${state.draft.rangePercent}" />
              </div>

              <div class="setting">
                <div class="setting-head">
                  <span class="setting-label">Center ${help("Trim relative to the 1500 us center point.")}</span>
                  <span class="setting-value">${escapeHtml(formatSignedUs(state.draft.neutralUs))} us</span>
                </div>
                <input class="slider" data-slider="neutral" type="range" min="-127" max="127" step="1" value="${state.draft.neutralUs}" />
              </div>

              <div class="setting">
                <div class="setting-head">
                  <span class="setting-label">Direction ${help("Clockwise or counterclockwise positive motion.")}</span>
                  <span class="setting-value">${escapeHtml(directionLabel(state.draft.direction))}</span>
                </div>
                <div class="direction-row">
                  <button class="direction-button" data-direction="cw" data-selected="${state.draft.direction === "cw"}">CW</button>
                  <button class="direction-button" data-direction="ccw" data-selected="${state.draft.direction === "ccw"}">CCW</button>
                </div>
              </div>

              <div class="toggle-setting">
                <div class="setting-head">
                  <span class="setting-label">Ramp ${help("Ease into motion instead of slamming to the target.")}</span>
                </div>
                <div class="toggle-pills">
                  <button class="toggle-pill" data-toggle-kind="softStart" data-toggle-value="false" data-selected="${!state.draft.softStart}">Off</button>
                  <button class="toggle-pill" data-toggle-kind="softStart" data-toggle-value="true" data-selected="${state.draft.softStart}">On</button>
                </div>
              </div>

              <div class="setting">
                <div class="setting-head">
                  <span class="setting-label">On signal loss ${help("Behavior when PWM goes away.")}</span>
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

              <div class="load-save-row">
                <button class="load-save-button" data-command="load">Load</button>
                <button class="load-save-button" data-command="save">Save</button>
              </div>
              <div class="drop-hint">drop JSON</div>

              ${
                state.loadPanelOpen
                  ? `
                    <div class="load-panel">
                      <div class="profile-grid">
                        ${PROFILE_PRESETS.map(
                          (profile) => `
                            <button class="profile-chip" data-profile-id="${escapeHtml(profile.id)}" data-selected="${profile.id === state.draft.profileId}">
                              ${escapeHtml(profile.label)}
                            </button>
                          `,
                        ).join("")}
                      </div>
                      <button class="load-save-button" data-command="file">File</button>
                      <input type="file" accept="application/json,.json" data-file-input hidden />
                    </div>
                  `
                  : ""
              }
                    </section>

                    <section class="pane sim-pane">
              <div class="sim-grid">
                <div class="sim-left">
                  <div class="servo-card">
                    ${servoSketch(operating.spec, point, state.draft)}
                  </div>

                  ${
                    state.draft.mode === "servo_mode"
                      ? `
                        <div class="toggle-setting">
                          <div class="setting-head">
                            <span class="setting-label">Sweep ${help("Animate from 500 us to 2500 us and back.")}</span>
                          </div>
                          <div class="toggle-pills">
                            <button class="toggle-pill" data-toggle-kind="sweep" data-toggle-value="false" data-selected="${!state.draft.sweepEnabled}">Manual</button>
                            <button class="toggle-pill" data-toggle-kind="sweep" data-toggle-value="true" data-selected="${state.draft.sweepEnabled}">Sweep</button>
                          </div>
                        </div>
                      `
                      : ""
                  }

                  <div class="sim-sliders">
                    <div class="mini-row">
                      <div class="mini-label">PWM ${help("500 us to 2500 us drive command.")}</div>
                      <div>
                        <div class="mini-value">${point.pwmUs} us</div>
                        <input class="slider" data-slider="pwm" type="range" min="500" max="2500" step="10" value="${point.pwmUs}" />
                        <div class="mini-range"><span>500</span><span>1500</span><span>2500</span></div>
                      </div>
                    </div>

                    <div class="mini-row">
                      <div class="mini-label">Voltage ${help("Supply voltage for the motor curves.")}</div>
                      <div>
                        <div class="mini-value">${state.draft.voltage.toFixed(1)} V</div>
                        <input class="slider" data-slider="voltage" type="range" min="4.8" max="8.4" step="0.1" value="${state.draft.voltage}" list="voltage-detents" />
                        <datalist id="voltage-detents">
                          ${voltageDetents.map((value) => `<option value="${value}"></option>`).join("")}
                        </datalist>
                        <div class="mini-range">${voltageDetents.map((value) => `<span>${value}</span>`).join("")}</div>
                      </div>
                    </div>

                    <div class="mini-row">
                      <div class="mini-label">Load ${help("Operating load in the same units as the servo data sheet.")}</div>
                      <div>
                        <div class="mini-value">${state.draft.loadKgcm.toFixed(1)} kgf*cm</div>
                        <input class="slider" data-slider="load" type="range" min="0" max="${operating.torqueMax.toFixed(1)}" step="0.1" value="${state.draft.loadKgcm.toFixed(1)}" />
                        <div class="mini-range"><span>0.0</span><span>${operating.torqueMax.toFixed(1)}</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="sim-right">
                  ${lineChart(
                    "speed / current",
                    `${modeLabel(state.draft.mode)} @ ${state.draft.voltage.toFixed(1)}V`,
                    xMax,
                    speedMax,
                    currentMax,
                    speedPath,
                    currentPath,
                    point.torqueKgcm,
                    point.speedRpm,
                    point.currentA,
                    formatOperatingTooltip(point, "speed"),
                    formatOperatingTooltip(point, "current"),
                    "speed (rpm)",
                    "current (A)",
                  )}

                  ${powerChart(
                    "mechanical power",
                    xMax,
                    powerMax,
                    powerPath,
                    point.torqueKgcm,
                    point.mechanicalPowerW,
                    formatOperatingTooltip(point, "power"),
                    "power (W)",
                  )}

                  ${powerChart(
                    "efficiency",
                    xMax,
                    efficiencyMax,
                    efficiencyPath,
                    point.torqueKgcm,
                    point.efficiency,
                    formatOperatingTooltip(point, "efficiency"),
                    "efficiency",
                  )}
                </div>
              </div>
                    </section>
                  </div>
                `
          }

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
        state.sweepPhase = 0;
        updateSweepTimer();
        render();
      });
    });

    options.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.draft.mode = button.dataset.mode === "cr_mode" ? "cr_mode" : "servo_mode";
        if (state.draft.mode === "cr_mode") {
          state.draft.sweepEnabled = false;
          state.draft.profileId =
            state.draft.profileId === "claw" ? "intake" : state.draft.profileId;
        } else if (!state.draft.sweepEnabled) {
          state.draft.sweepEnabled = true;
        }
        state.sweepPhase = 0;
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
          case "neutral":
            state.draft.neutralUs = clamp(Number(input.value), -127, 127);
            break;
          case "pwm":
            state.draft.pwmUs = clamp(Number(input.value), 500, 2500);
            state.draft.sweepEnabled = false;
            break;
          case "voltage":
            state.draft.voltage = clamp(Number(input.value), 4.8, 8.4);
            break;
          case "load":
            state.draft.loadKgcm = clamp(Number(input.value), 0, operating.torqueMax);
            break;
          default:
            break;
        }
        updateSweepTimer();
        render();
      });
    });

    options.root.querySelectorAll<HTMLButtonElement>("[data-toggle-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextValue = button.dataset.toggleValue === "true";
        if (button.dataset.toggleKind === "softStart") {
          state.draft.softStart = nextValue;
        }
        if (button.dataset.toggleKind === "sweep") {
          state.draft.sweepEnabled = nextValue;
          if (nextValue) {
            state.sweepPhase = 0;
          }
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

    options.root.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
      button.addEventListener("click", () => {
        const command = button.dataset.command;
        if (command === "connect-adapter") void doConnectAndSync();
        if (command === "retry-servo") void doSync();
        if (command === "load") {
          state.loadPanelOpen = !state.loadPanelOpen;
          render();
        }
        if (command === "file") {
          fileInput?.click();
        }
        if (command === "save") {
          triggerSave();
        }
        if (command === "discard") {
          void doSync();
        }
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
    updateSweepTimer();
    render();
  }

  void bootstrap();
}
