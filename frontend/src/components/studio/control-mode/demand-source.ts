/**
 * Demand-source computations.
 *
 * Two paths into the same `DemandSnapshot` shape:
 *
 *   1. `computeDemandFromDetectors(state, bearings)` — derives demand
 *      from live runtime detector state.  Returns `null` when there
 *      are no detectors configured; the caller then falls back to the
 *      simulator.  This is the seam future real-hardware ingestion
 *      plugs into — anything that updates `state.detectors[].active`
 *      flows here automatically (a fresh socket payload, a new
 *      poll endpoint, an adapter to a third-party detector network).
 *
 *   2. `computeDemandFromSimulator(seed, tick, bearings)` — the
 *      deterministic sine-wave demand we've had since the advisory
 *      layer shipped.  Used as a fallback for intersections without
 *      configured detectors so the engine still has *some* signal
 *      to reason about.
 */

import type { ApproachBearing } from "@/components/studio/state/types";
import type {
  DetectorState,
  IntersectionRuntimeState,
} from "@/types/intersection-runtime";

import type { DemandSnapshot } from "@/components/studio/control-mode/advisory";

// ──────────────────────── Detector-derived demand

/**
 * Derive a `DemandSnapshot` from live detector telemetry.  Returns
 * `null` when the runtime state has no detectors at all — the caller
 * should then fall back to the simulator.
 *
 * Activity model:
 *   - Per bearing, count detectors that are currently `active` and
 *     count detectors that activated within the recent past
 *     (`recencyWindowMs`, default 12 s).
 *   - Demand for that bearing = (active * weightActive +
 *     recentlyActive * weightRecent) / total detectors at that
 *     bearing, clamped to 0..1.
 *   - The "recently active" component smooths the binary
 *     active/idle signal so the demand bar doesn't strobe between
 *     0 % and 100 % every time a single detector flips.
 */
export interface DetectorDemandOptions {
  recencyWindowMs?: number;
  weightActive?: number;
  weightRecent?: number;
  queuePerActive?: number;
  /** If provided, used as `now`.  Tests pass an explicit value;
   *  production passes `Date.now()`. */
  nowMs?: number;
}

export function computeDemandFromDetectors(
  state: IntersectionRuntimeState | null,
  bearings: ApproachBearing[],
  options: DetectorDemandOptions = {},
): DemandSnapshot | null {
  if (!state || state.detectors.length === 0) return null;

  const recencyWindowMs = options.recencyWindowMs ?? 12_000;
  const weightActive = options.weightActive ?? 0.7;
  const weightRecent = options.weightRecent ?? 0.3;
  const queuePerActive = options.queuePerActive ?? 8;
  const now = options.nowMs ?? Date.now();

  // Bucket detectors by bearing.  The runtime's Bearing type is the
  // 4-cardinal subset of ApproachBearing — safe to widen.
  const buckets = new Map<ApproachBearing, DetectorState[]>();
  for (const d of state.detectors) {
    const key = d.approachBearing as ApproachBearing;
    const list = buckets.get(key) ?? [];
    list.push(d);
    buckets.set(key, list);
  }

  const byBearing = new Map<ApproachBearing, number>();
  const queueByBearing = new Map<ApproachBearing, number>();

  for (const bearing of bearings) {
    const detectors = buckets.get(bearing) ?? [];
    if (detectors.length === 0) {
      byBearing.set(bearing, 0);
      queueByBearing.set(bearing, 0);
      continue;
    }
    let activeCount = 0;
    let recentCount = 0;
    for (const det of detectors) {
      if (det.active) activeCount += 1;
      if (det.lastActivationAt) {
        const t = Date.parse(det.lastActivationAt);
        if (Number.isFinite(t) && now - t <= recencyWindowMs) {
          recentCount += 1;
        }
      }
    }
    const score =
      (activeCount * weightActive + recentCount * weightRecent) /
      detectors.length;
    const clamped = Math.max(0, Math.min(1, score));
    byBearing.set(bearing, clamped);
    queueByBearing.set(bearing, Math.round(activeCount * queuePerActive));
  }

  return { byBearing, queueByBearing, source: "detectors" };
}

// ──────────────────────── Simulator-derived demand

const BEARING_ORDER: ApproachBearing[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

interface SimPattern {
  baseline: number;
  amplitude: number;
  periodSec: number;
  phaseOffsetSec: number;
}

function patternFor(bearing: ApproachBearing, seed: number): SimPattern {
  const idx = BEARING_ORDER.indexOf(bearing);
  return {
    baseline: 0.18 + idx * 0.04,
    amplitude: 0.32 + (idx % 3) * 0.09,
    periodSec: 32 + idx * 7,
    phaseOffsetSec: ((idx * 11) + (seed % 23)) % 60,
  };
}

export function computeDemandFromSimulator(
  seed: number,
  tickSec: number,
  bearings: ApproachBearing[],
): DemandSnapshot {
  const byBearing = new Map<ApproachBearing, number>();
  const queueByBearing = new Map<ApproachBearing, number>();
  const t = tickSec + (seed % 60);
  for (const b of bearings) {
    const p = patternFor(b, seed);
    const v =
      p.baseline +
      p.amplitude *
        0.5 *
        (1 +
          Math.sin((2 * Math.PI * (t + p.phaseOffsetSec)) / p.periodSec));
    const clamped = Math.max(0, Math.min(1, v));
    byBearing.set(b, clamped);
    queueByBearing.set(b, Math.round(clamped * 30));
  }
  return { byBearing, queueByBearing, source: "simulator" };
}

export function seedFor(intersectionId: string): number {
  let s = 0;
  for (let i = 0; i < intersectionId.length; i += 1) {
    s = (s * 31 + intersectionId.charCodeAt(i)) | 0;
  }
  return Math.abs(s);
}
