import { findModel, loadCatalog } from "./catalog.ts";

export type PwmLossBehavior = "release" | "hold" | "neutral";
export type InversionMode = "normal" | "reversed";

export interface OverloadLevelSummary {
  pct: number;
  sec: number;
}

export interface ConfigSetupSummary {
  rangeDegrees: number | null;
  rangePercent: number | null;
  neutralUs: number | null;
  neutralPercent: number | null;
  pwmLossBehavior: PwmLossBehavior | null;
  inversion: InversionMode | null;
  softStart: boolean | null;
  sensitivityStep: number | null;
  sensitivityLabel: string | null;
  dampeningFactor: number | null;
  overloadProtectionEnabled: boolean | null;
  overloadLevels: OverloadLevelSummary[];
  pwmPowerPercent: number | null;
  proptlSeconds: number | null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function sensitivityLabel(step: number): string {
  if (step <= 1) return "Ultra High";
  if (step <= 4) return "High";
  if (step <= 8) return "Medium";
  if (step <= 11) return "Low";
  return "Very Low";
}

function readBeU16(config: Uint8Array, offset: number): number {
  return ((config[offset] ?? 0) << 8) | (config[offset + 1] ?? 0);
}

function overloadLevels(config: Uint8Array): OverloadLevelSummary[] {
  return Array.from({ length: 3 }, (_, index) => {
    const powerRaw = config[0x35 + index * 2] ?? 0;
    const timeRaw = config[0x36 + index * 2] ?? 0;
    return {
      pct: Number(((powerRaw * 100) / 255).toFixed(1)),
      sec: Number((timeRaw * 0.1).toFixed(1)),
    };
  });
}

export function summarizeConfig(config: Uint8Array, modelId: string): ConfigSetupSummary {
  const model = findModel(loadCatalog(), modelId);
  const maxRangeDeg = model?.max_range_deg ?? 355;

  const rangeRaw = config[0x04] ?? 0;
  const neutralRaw = config[0x06] ?? 0x80;
  const dampeningFactorRaw = readBeU16(config, 0x0a);
  const sensitivityRaw = config[0x0c] ?? 0x10;
  const flags = config[0x25] ?? 0x00;
  const pwmPowerRaw = config[0x11] ?? 0x00;
  const proptlRaw = config[0x36] ?? 0x00;

  const rangeDegrees = Math.round((rangeRaw * maxRangeDeg) / 255);
  const neutralUs = neutralRaw - 128;
  const sensitivityStep = clamp(Math.floor(sensitivityRaw / 16) - 1, 0, 14);
  const pwmLossBits = flags & 0x60;

  let pwmLossBehavior: PwmLossBehavior = "release";
  if (pwmLossBits === 0x40) pwmLossBehavior = "hold";
  if (pwmLossBits === 0x60) pwmLossBehavior = "neutral";

  return {
    rangeDegrees,
    rangePercent: Math.round((rangeRaw * 100) / 255),
    neutralUs,
    neutralPercent: Math.round((neutralRaw * 100) / 255),
    pwmLossBehavior,
    inversion: (flags & 0x02) !== 0 ? "reversed" : "normal",
    softStart: (flags & 0x10) !== 0,
    sensitivityStep,
    sensitivityLabel: sensitivityLabel(sensitivityStep),
    dampeningFactor: dampeningFactorRaw,
    overloadProtectionEnabled: (flags & 0x80) !== 0,
    overloadLevels: overloadLevels(config),
    pwmPowerPercent: Math.round((pwmPowerRaw * 100) / 255),
    proptlSeconds: Number((proptlRaw * 0.1).toFixed(1)),
  };
}

export function servoModeLabel(mode: "servo_mode" | "cr_mode" | "unknown"): string {
  if (mode === "servo_mode") return "Servo";
  if (mode === "cr_mode") return "Continuous Rotation";
  return "Unknown";
}
