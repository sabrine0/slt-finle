"use client";

/**
 * Auto-controller hook.
 *
 * When `enabled` is true, evaluates the advisory recommendation on a
 * fixed 2 s cadence and dispatches `forceIntersectionPhase` when a
 * switch is warranted.  The hook is pure frontend — it talks to the
 * backend only through the existing runtime endpoint.  Backend
 * safety rules (min-green/yellow/red-clearance handling, emergency
 * mode rejection) remain the source of truth; the hook's gates
 * prevent us from *issuing* commands that would be unsafe or noisy.
 *
 * Safety gates (skip dispatch when ANY is true):
 *   • !enabled
 *   • `state.commands.manualOverride === true`
 *   • `state.commands.modeOverride` is set and not "adaptive"
 *   • `state.commands.forcedDirection !== null`
 *   • `state.commands.forcedPhaseId` is set AND differs from auto's
 *     own last dispatch (operator has overridden us)
 *   • A previous dispatch is still in flight
 *   • Current phase hasn't met its min-green yet
 *   • Last dispatch was less than `throttleMs` ago
 *   • Recommendation matches the already-active phase (no switch needed)
 *   • Recommendation would co-green a movement already green
 *     (conflict-matrix pre-flight)
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  validatePhaseAction,
} from "@/components/studio/control-mode/advisory";
import { forceIntersectionPhase } from "@/lib/intersection-runtime-api";
import { CommandPlatformApiError } from "@/lib/command-platform-api";
import type { IntersectionConfig } from "@/components/studio/state/types";
import type { IntersectionRuntimeState } from "@/types/intersection-runtime";
import type { PhaseRecommendation } from "@/components/studio/control-mode/advisory";

export type AutoStatus =
  | "off"
  | "driving"
  | "waiting-min-green"
  | "paused-operator"
  | "paused-emergency"
  | "idle";

export interface AutoControllerState {
  status: AutoStatus;
  secondsUntilNextSwitch: number;
  lastDecisionAt: number | null;
}

interface UseAutoControllerArgs {
  enabled: boolean;
  intersectionId: string;
  config: IntersectionConfig | null;
  state: IntersectionRuntimeState | null;
  recommendation: PhaseRecommendation | null;
  currentlyGreenSgIds: string[];
  onLog: (entry: string) => void;
  /** Eval cadence in ms.  Default 2000. */
  tickMs?: number;
  /** Minimum ms between successful dispatches.  Default 1500. */
  throttleMs?: number;
}

export function useAutoController({
  enabled,
  intersectionId,
  config,
  state,
  recommendation,
  currentlyGreenSgIds,
  onLog,
  tickMs = 2000,
  throttleMs = 1500,
}: UseAutoControllerArgs): AutoControllerState {
  // Snapshots of inputs so the stable interval reads the latest data
  // through refs without forcing a re-create on every render.
  const stateRef = useRef<IntersectionRuntimeState | null>(state);
  const configRef = useRef<IntersectionConfig | null>(config);
  const recRef = useRef<PhaseRecommendation | null>(recommendation);
  const greensRef = useRef<string[]>(currentlyGreenSgIds);
  const onLogRef = useRef(onLog);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { recRef.current = recommendation; }, [recommendation]);
  useEffect(() => { greensRef.current = currentlyGreenSgIds; }, [currentlyGreenSgIds]);
  useEffect(() => { onLogRef.current = onLog; }, [onLog]);

  // Internal auto-controller state.
  const lastDispatchAtRef = useRef<number>(0);
  const lastAutoForcedPhaseIdRef = useRef<string | null>(null);
  const phaseStartedAtRef = useRef<number>(Date.now());
  const previousActivePhaseIdRef = useRef<string | null>(null);
  const dispatchInFlightRef = useRef<boolean>(false);

  // Reset everything when the intersection changes or AUTO is turned
  // off — prevents a stale "last auto force" from a different
  // intersection from silently permitting operator-looking dispatches.
  useEffect(() => {
    lastDispatchAtRef.current = 0;
    lastAutoForcedPhaseIdRef.current = null;
    phaseStartedAtRef.current = Date.now();
    previousActivePhaseIdRef.current = null;
    dispatchInFlightRef.current = false;
  }, [intersectionId, enabled]);

  // Track phase changes so we can measure min-green elapsed.  This
  // fires from runtime state, not from our own dispatches — a cleaner
  // clock that picks up transitions regardless of who initiated them.
  useEffect(() => {
    const currentId = state?.activePhaseId ?? null;
    if (currentId !== previousActivePhaseIdRef.current) {
      previousActivePhaseIdRef.current = currentId;
      phaseStartedAtRef.current = Date.now();
    }
  }, [state?.activePhaseId]);

  // Derived status for the UI banner.  Recomputed every render so
  // the countdown stays fresh as runtime ticks.
  const status = computeStatus({
    enabled,
    state,
    recommendation,
    phaseStartedAt: phaseStartedAtRef.current,
  });

  // Surface the last decision instant so the UI can badge it.
  const [lastDecisionAt, setLastDecisionAt] = useState<number | null>(null);

  const evaluate = useCallback(async () => {
    if (!enabled) return;
    if (dispatchInFlightRef.current) return;
    const s = stateRef.current;
    const c = configRef.current;
    const rec = recRef.current;
    if (!s || !c || !rec) return;

    // Operator-control gates
    if (s.commands.manualOverride) return;
    if (s.commands.modeOverride && s.commands.modeOverride !== "adaptive") return;
    if (s.commands.forcedDirection !== null) return;
    if (
      s.commands.forcedPhaseId !== null &&
      s.commands.forcedPhaseId !== lastAutoForcedPhaseIdRef.current
    ) return;

    // No switch needed — already running the recommendation, or
    // already-forced toward it (mid yellow/red-clearance transition).
    // Without this second guard we'd redundantly re-force the same
    // target on every tick during the transition window.
    if (rec.phaseId === s.activePhaseId) return;
    if (s.commands.forcedPhaseId === rec.phaseId) return;

    // Min-green
    const activeSlice = s.orderedSlices.find(
      (slice) => slice.phaseId === s.activePhaseId,
    );
    const minGreenMs = (activeSlice?.minGreenSeconds ?? 8) * 1000;
    if (Date.now() - phaseStartedAtRef.current < minGreenMs) return;

    // Throttle
    if (Date.now() - lastDispatchAtRef.current < throttleMs) return;

    // Conflict pre-flight (reuse the advisory validator so AUTO
    // never dispatches what MANUAL would demand a confirm-tap for).
    const validation = validatePhaseAction(
      c,
      rec.phaseId,
      greensRef.current,
    );
    if (validation.severity === "blocked") {
      onLogRef.current(
        `⚠ AUTO skipped ${rec.phaseId} — ${validation.message}`,
      );
      return;
    }

    dispatchInFlightRef.current = true;
    try {
      await forceIntersectionPhase(intersectionId, rec.phaseId);
      lastDispatchAtRef.current = Date.now();
      lastAutoForcedPhaseIdRef.current = rec.phaseId;
      setLastDecisionAt(Date.now());
      onLogRef.current(`▶ AUTO → ${rec.phaseId} · ${rec.reason}`);
    } catch (err) {
      const detail =
        err instanceof CommandPlatformApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "unknown";
      onLogRef.current(`✗ AUTO → ${rec.phaseId} rejected: ${detail}`);
    } finally {
      dispatchInFlightRef.current = false;
    }
  }, [enabled, intersectionId, throttleMs]);

  // Stable evaluation interval.  Recreated only when `enabled` or
  // `intersectionId` flips — all other inputs flow through refs.
  useEffect(() => {
    if (!enabled) return;
    const handle = window.setInterval(() => {
      void evaluate();
    }, tickMs);
    // Fire once immediately so the operator sees a decision without
    // a leading dead tick.
    void evaluate();
    return () => window.clearInterval(handle);
  }, [enabled, intersectionId, tickMs, evaluate]);

  // Rough countdown for the UI — only meaningful in "waiting-min-green".
  const activeSliceForStatus = state?.orderedSlices.find(
    (slice) => slice.phaseId === state?.activePhaseId,
  );
  const minGreenMs = (activeSliceForStatus?.minGreenSeconds ?? 8) * 1000;
  const elapsed = Date.now() - phaseStartedAtRef.current;
  const secondsUntilNextSwitch = Math.max(
    0,
    Math.ceil((minGreenMs - elapsed) / 1000),
  );

  return { status, secondsUntilNextSwitch, lastDecisionAt };
}

function computeStatus({
  enabled,
  state,
  recommendation,
  phaseStartedAt,
}: {
  enabled: boolean;
  state: IntersectionRuntimeState | null;
  recommendation: PhaseRecommendation | null;
  phaseStartedAt: number;
}): AutoStatus {
  if (!enabled) return "off";
  if (!state) return "idle";
  if (
    state.commands.modeOverride &&
    state.commands.modeOverride !== "adaptive"
  ) {
    return "paused-emergency";
  }
  if (
    state.commands.manualOverride ||
    state.commands.forcedDirection !== null
  ) {
    return "paused-operator";
  }
  if (!recommendation) return "idle";
  if (recommendation.phaseId === state.activePhaseId) return "driving";

  const activeSlice = state.orderedSlices.find(
    (slice) => slice.phaseId === state.activePhaseId,
  );
  const minGreenMs = (activeSlice?.minGreenSeconds ?? 8) * 1000;
  if (Date.now() - phaseStartedAt < minGreenMs) return "waiting-min-green";
  return "driving";
}
