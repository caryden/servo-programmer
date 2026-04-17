export interface VoltagePoint {
  voltage: number;
  torqueKgcm: number;
  speedSec60: number;
  idleA: number;
  stallA: number;
}

export interface ServoSpec {
  bodyWidth: number;
  bodyHeight: number;
  axisInsetY: number;
  maxRangeDeg: number;
  points: VoltagePoint[];
}

// Axon legacy v1.3 servo operating points used by the browser/desktop simulator.
// Units match the published servo datasheets so the UI can present familiar FTC values.
export const AXON_MINI_SPEC: ServoSpec = {
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

export const AXON_MICRO_SPEC: ServoSpec = {
  bodyWidth: 112,
  bodyHeight: 214,
  axisInsetY: 40,
  maxRangeDeg: 355,
  points: [
    { voltage: 4.8, torqueKgcm: 4.2, speedSec60: 0.16, idleA: 0.1, stallA: 1.0 },
    { voltage: 6.0, torqueKgcm: 5.2, speedSec60: 0.13, idleA: 0.12, stallA: 1.3 },
    { voltage: 7.4, torqueKgcm: 6.5, speedSec60: 0.11, idleA: 0.14, stallA: 1.6 },
    { voltage: 8.4, torqueKgcm: 7.1, speedSec60: 0.1, idleA: 0.16, stallA: 1.8 },
  ],
};

export const AXON_MAX_SPEC: ServoSpec = {
  bodyWidth: 144,
  bodyHeight: 246,
  axisInsetY: 46,
  maxRangeDeg: 355,
  points: [
    { voltage: 4.8, torqueKgcm: 28, speedSec60: 0.14, idleA: 0.28, stallA: 3.6 },
    { voltage: 6.0, torqueKgcm: 34, speedSec60: 0.115, idleA: 0.32, stallA: 4.0 },
    { voltage: 7.2, torqueKgcm: 39, speedSec60: 0.1, idleA: 0.36, stallA: 4.3 },
    { voltage: 8.4, torqueKgcm: 45, speedSec60: 0.085, idleA: 0.4, stallA: 4.6 },
  ],
};

export function lookupServoSpec(
  modelId: string | null,
  modelName: string | null,
  fallbackRangeDeg?: number | null,
): ServoSpec {
  if ((modelId ?? "").startsWith("SA20") || (modelName ?? "").toLowerCase().includes("micro")) {
    return AXON_MICRO_SPEC;
  }
  if ((modelId ?? "").startsWith("SA81") || (modelName ?? "").toLowerCase().includes("max")) {
    return AXON_MAX_SPEC;
  }
  if ((fallbackRangeDeg ?? 0) > AXON_MINI_SPEC.maxRangeDeg) {
    return {
      ...AXON_MINI_SPEC,
      maxRangeDeg: fallbackRangeDeg ?? AXON_MINI_SPEC.maxRangeDeg,
    };
  }
  return AXON_MINI_SPEC;
}
