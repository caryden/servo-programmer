import { findModel, loadCatalog } from "./catalog.ts";

export type PwmLossBehavior = "release" | "hold" | "neutral";
export type InversionMode = "normal" | "reversed";

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
  pwmPowerPercent: number | null;
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

export function summarizeConfig(config: Uint8Array, modelId: string): ConfigSetupSummary {
  const model = findModel(loadCatalog(), modelId);
  const maxRangeDeg = model?.max_range_deg ?? 355;

  const rangeRaw = config[0x04] ?? 0;
  const neutralRaw = config[0x06] ?? 0x80;
  const sensitivityRaw = config[0x0c] ?? 0x10;
  const flags = config[0x25] ?? 0x00;
  const pwmPowerRaw = config[0x11] ?? 0x00;

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
    pwmPowerPercent: Math.round((pwmPowerRaw * 100) / 255),
  };
}

export function servoModeLabel(mode: "servo_mode" | "cr_mode" | "unknown"): string {
  if (mode === "servo_mode") return "Servo";
  if (mode === "cr_mode") return "Continuous Rotation";
  return "Unknown";
}
