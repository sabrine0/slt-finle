/**
 * Client-side advisory layer for Control Mode.
 *
 * No backend or API changes happen here.  These pure helpers reason
 * locally over the studio config + live runtime state to give the
 * operator decision support: which phase serves the most demand,
 * which movements would conflict if forced, and how to bias for an
 * "emergency route" the operator has declared.
 */

import type {
  ApproachBearing,
  ConflictPair,
  IntersectionConfig,
} from "@/components/studio/state/types";
import type { OperatorDirection } from "@/types/command-platform";

export const DIRECTION_TO_BEARING: Record<OperatorDirection, ApproachBearing> = {
  N: "N",
  E: "E",
  S: "S",
  W: "W",
};

/** Where the current demand snapshot is coming from.  The advisory
 *  layer is source-agnostic — both paths produce the same shape. */
export type DemandSource = "detectors" | "simulator";

export interface DemandSnapshot {
  /** demand 0..1 per cardinal/inter-cardinal bearing */
  byBearing: Map<ApproachBearing, number>;
  /** simple vehicles-waiting estimate per bearing (demand × 30) */
  queueByBearing: Map<ApproachBearing, number>;
  /** "detectors" when derived from live runtime detector state,
   *  "simulator" when falling back to the deterministic sine pattern. */
  source: DemandSource;
}

export interface PhaseRecommendation {
  phaseId: string;
  score: number;
  reason: string;
}

/** All signal-group ids whose approach bearing matches the operator
 *  direction.  Used both for visual highlighting and for predicting
 *  whether a force-direction would conflict. */
export function signalGroupsForDirection(
  config: IntersectionConfig,
  direction: OperatorDirection,
): string[] {
  const targetApproachIds = new Set(
    config.approaches
      .filter((a) => a.bearing === DIRECTION_TO_BEARING[direction])
      .map((a) => a.id),
  );
  return config.signalGroups
    .filter((sg) => sg.approachId && targetApproachIds.has(sg.approachId))
    .map((sg) => sg.id);
}

/** All SG ids whose approach bearing matches the given inter-cardinal. */
export function signalGroupsForBearing(
  config: IntersectionConfig,
  bearing: ApproachBearing,
): string[] {
  const targetApproachIds = new Set(
    config.approaches.filter((a) => a.bearing === bearing).map((a) => a.id),
  );
  return config.signalGroups
    .filter((sg) => sg.approachId && targetApproachIds.has(sg.approachId))
    .map((sg) => sg.id);
}

/** Conflict pairs that *would* be created if these candidate SGs went
 *  green together with the SGs already green.  Used as a pre-flight
 *  for force-direction and force-phase. */
export function conflictsAgainstGreens(
  config: IntersectionConfig,
  candidateSgIds: string[],
  currentlyGreenSgIds: string[],
): ConflictPair[] {
  const out: ConflictPair[] = [];
  for (const candidate of candidateSgIds) {
    for (const green of currentlyGreenSgIds) {
      if (candidate === green) continue;
      const hit = config.conflicts.find(
        (p) =>
          (p.a === candidate && p.b === green) ||
          (p.a === green && p.b === candidate),
      );
      if (hit) out.push(hit);
    }
  }
  return out;
}

/** Aggregate demand served by a phase: sum of bearing-demand for each
 *  green SG's approach.  Higher = more pressure released by running it. */
export function scorePhase(
  config: IntersectionConfig,
  phaseId: string,
  demand: DemandSnapshot,
): number {
  const phase = config.phases.find((p) => p.id === phaseId);
  if (!phase) return 0;
  const sgById = new Map(config.signalGroups.map((sg) => [sg.id, sg]));
  const apprById = new Map(config.approaches.map((a) => [a.id, a]));
  let total = 0;
  for (const sgId of phase.greenSignalGroupIds) {
    const sg = sgById.get(sgId);
    if (!sg || !sg.approachId) continue;
    const appr = apprById.get(sg.approachId);
    if (!appr) continue;
    total += demand.byBearing.get(appr.bearing) ?? 0;
  }
  return total;
}

/** Pick the next phase that maximises served demand, excluding the
 *  currently-active one.  When `emergencyRoute` is set, phases that
 *  serve that bearing get a strong score bias so they win ties.
 *  This is a thin wrapper over `phasePriorityList` — the head of the
 *  ranked list with the same enriched reason string. */
export function recommendNextPhase(
  config: IntersectionConfig,
  activePhaseId: string | null,
  demand: DemandSnapshot,
  emergencyRoute: OperatorDirection | null,
): PhaseRecommendation | null {
  const ranked = phasePriorityList(
    config,
    activePhaseId,
    demand,
    emergencyRoute,
  );
  if (ranked.length === 0) return null;
  const top = ranked[0];
  return { phaseId: top.phaseId, score: top.score, reason: top.reason };
}

/** True when a phase has zero served demand AND is not the emergency
 *  route — useful for "skip empty phase" feedback. */
export function isPhaseSkippable(
  config: IntersectionConfig,
  phaseId: string,
  demand: DemandSnapshot,
  emergencyRoute: OperatorDirection | null,
): boolean {
  if (emergencyRoute) {
    const routeSgs = new Set(signalGroupsForDirection(config, emergencyRoute));
    const phase = config.phases.find((p) => p.id === phaseId);
    if (phase?.greenSignalGroupIds.some((id) => routeSgs.has(id))) {
      return false; // never skip the emergency route
    }
  }
  return scorePhase(config, phaseId, demand) < 0.05;
}

// ──────────────────────── Phase calls and ranked priority list

const CALL_THRESHOLD = 0.18;

/** A phase has a "call" (in real traffic-engineering vocabulary) when
 *  at least one of its green signal groups is on an approach with
 *  observed demand above a small threshold.  Phases with no calls are
 *  candidates for "skip stage" behaviour in adaptive plans. */
export function phaseHasCall(
  config: IntersectionConfig,
  phaseId: string,
  demand: DemandSnapshot,
): boolean {
  const phase = config.phases.find((p) => p.id === phaseId);
  if (!phase) return false;
  const sgById = new Map(config.signalGroups.map((sg) => [sg.id, sg]));
  const apprById = new Map(config.approaches.map((a) => [a.id, a]));
  for (const sgId of phase.greenSignalGroupIds) {
    const sg = sgById.get(sgId);
    if (!sg || !sg.approachId) continue;
    const appr = apprById.get(sg.approachId);
    if (!appr) continue;
    const v = demand.byBearing.get(appr.bearing) ?? 0;
    if (v >= CALL_THRESHOLD) return true;
  }
  return false;
}

/** Per-phase summary: top contributing bearings with their queue
 *  estimate.  Used to render a human reason like "N (12), S (8)". */
function topBearings(
  config: IntersectionConfig,
  phaseId: string,
  demand: DemandSnapshot,
  limit = 2,
): Array<{ bearing: ApproachBearing; queue: number }> {
  const phase = config.phases.find((p) => p.id === phaseId);
  if (!phase) return [];
  const sgById = new Map(config.signalGroups.map((sg) => [sg.id, sg]));
  const apprById = new Map(config.approaches.map((a) => [a.id, a]));
  const totals = new Map<ApproachBearing, number>();
  for (const sgId of phase.greenSignalGroupIds) {
    const sg = sgById.get(sgId);
    if (!sg || !sg.approachId) continue;
    const appr = apprById.get(sg.approachId);
    if (!appr) continue;
    totals.set(
      appr.bearing,
      (totals.get(appr.bearing) ?? 0) +
        (demand.queueByBearing.get(appr.bearing) ?? 0),
    );
  }
  return Array.from(totals.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([bearing, queue]) => ({ bearing, queue }));
}

export interface RankedPhase {
  phaseId: string;
  score: number;
  hasCall: boolean;
  isEmergencyRoute: boolean;
  reason: string;
}

/** Full ranked list of candidate phases (excluding the active one).
 *  Top entry is `recommendNextPhase` with a richer `reason` string
 *  that names the top contributing bearings, the emergency route,
 *  or "no calls" when the phase has nothing waiting. */
export function phasePriorityList(
  config: IntersectionConfig,
  activePhaseId: string | null,
  demand: DemandSnapshot,
  emergencyRoute: OperatorDirection | null,
): RankedPhase[] {
  const candidates = config.phases.filter((p) => p.id !== activePhaseId);
  const routeSgs = emergencyRoute
    ? new Set(signalGroupsForDirection(config, emergencyRoute))
    : null;

  const ranked: RankedPhase[] = [];
  for (const phase of candidates) {
    const baseScore = scorePhase(config, phase.id, demand);
    let score = baseScore;
    const isRoute = routeSgs
      ? phase.greenSignalGroupIds.some((id) => routeSgs.has(id))
      : false;
    if (isRoute) score += 10; // emergency route bias
    if (phase.greenSignalGroupIds.length === 0) score -= 5;

    const tops = topBearings(config, phase.id, demand);
    const hasCall = phaseHasCall(config, phase.id, demand);
    let reason: string;
    if (isRoute) {
      reason = `serves emergency route ${emergencyRoute}`;
    } else if (tops.length === 0) {
      reason = "no calls — would run an empty phase";
    } else if (tops.length === 1) {
      reason = `${tops[0].bearing} has ${tops[0].queue} waiting`;
    } else {
      reason = tops
        .map((t) => `${t.bearing} (${t.queue})`)
        .join(" · ");
    }
    ranked.push({ phaseId: phase.id, score, hasCall, isEmergencyRoute: isRoute, reason });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

// ──────────────────────── Action validation (pre-flight safety)

export type ActionSeverity = "ok" | "blocked";

export interface ActionValidation {
  severity: ActionSeverity;
  conflicts: ConflictPair[];
  /** Plain-English summary suitable for tooltip / confirmation. */
  message: string | null;
}

/** Would forcing this direction co-green any movement that's already
 *  green according to the conflict matrix?  When yes, severity is
 *  `"blocked"` and the UI requires a confirm-tap before sending. */
export function validateDirectionAction(
  config: IntersectionConfig,
  direction: OperatorDirection,
  currentlyGreenSgIds: string[],
): ActionValidation {
  const candidates = signalGroupsForDirection(config, direction);
  const conflicts = conflictsAgainstGreens(
    config,
    candidates,
    currentlyGreenSgIds,
  );
  if (conflicts.length === 0) {
    return { severity: "ok", conflicts: [], message: null };
  }
  return {
    severity: "blocked",
    conflicts,
    message: `Crosses ${conflicts.length} green movement${conflicts.length === 1 ? "" : "s"} — confirm to override`,
  };
}

/** Would forcing this phase co-green movements that conflict with
 *  any movement currently green?  Returns the same shape as
 *  `validateDirectionAction`. */
export function validatePhaseAction(
  config: IntersectionConfig,
  phaseId: string,
  currentlyGreenSgIds: string[],
): ActionValidation {
  const phase = config.phases.find((p) => p.id === phaseId);
  if (!phase) return { severity: "ok", conflicts: [], message: null };
  const conflicts = conflictsAgainstGreens(
    config,
    phase.greenSignalGroupIds,
    currentlyGreenSgIds,
  );
  if (conflicts.length === 0) {
    return { severity: "ok", conflicts: [], message: null };
  }
  return {
    severity: "blocked",
    conflicts,
    message: `Phase greens conflict with ${conflicts.length} active movement${conflicts.length === 1 ? "" : "s"} — confirm to override`,
  };
}
