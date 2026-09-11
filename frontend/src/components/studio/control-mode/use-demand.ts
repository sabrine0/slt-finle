"use client";

/**
 * Demand hook with auto-selecting source.
 *
 * Returns a `DemandSnapshot` whose `source` field is:
 *   - `"detectors"`  when the runtime state has detectors configured
 *                    (any source updating `state.detectors[].active`
 *                    flows into the advisory layer automatically),
 *   - `"simulator"`  otherwise — the deterministic per-intersection
 *                    sine pattern used as a fallback so the engine
 *                    always has *some* signal to reason about.
 */

import { useEffect, useMemo, useState } from "react";

import {
  computeDemandFromDetectors,
  computeDemandFromSimulator,
  seedFor,
} from "@/components/studio/control-mode/demand-source";
import type { ApproachBearing } from "@/components/studio/state/types";
import type { DemandSnapshot } from "@/components/studio/control-mode/advisory";
import type { IntersectionRuntimeState } from "@/types/intersection-runtime";

export function useDemand(
  intersectionId: string,
  bearings: ApproachBearing[],
  runtimeState: IntersectionRuntimeState | null,
): DemandSnapshot {
  // 1 Hz tick — drives the simulator and refreshes the detector
  // recency window.  Cheap; no work happens unless something rendered.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const seed = useMemo(() => seedFor(intersectionId), [intersectionId]);
  const bearingsKey = bearings.join("|");
  const detectorCount = runtimeState?.detectors.length ?? 0;

  return useMemo(() => {
    const fromDetectors = computeDemandFromDetectors(runtimeState, bearings);
    if (fromDetectors) return fromDetectors;
    return computeDemandFromSimulator(seed, tick + (seed % 60), bearings);
    // bearingsKey + detectorCount stand in for the array/state changes
    // we actually care about — recomputing per-tick keeps both the
    // simulator curve and the detector recency window fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, seed, bearingsKey, detectorCount, runtimeState]);
}
