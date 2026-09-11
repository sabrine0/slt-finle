"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";

import { IntersectionDiagram } from "@/components/studio/intersection-editor/intersection-diagram";
import { useIntersectionState } from "@/components/studio/intersection-editor/use-intersection-state";
import { useStudioDispatch } from "@/components/studio/state/store";
import { CommandPlatformApiError } from "@/lib/command-platform-api";
import {
  applyIntersectionConfig,
  fetchIntersectionConfig,
  runtimeConfigToStudioConfig,
  studioConfigToRuntimePayload,
} from "@/lib/intersection-runtime-api";
import type {
  ApproachBearing,
  IntersectionConfig,
} from "@/components/studio/state/types";
import type {
  IntersectionRuntimeState,
  PhaseState,
  SignalAspect,
  SignalGroupState,
} from "@/types/intersection-runtime";

interface SchematicSectionProps {
  config: IntersectionConfig;
}

type ApplyOutcome =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; at: number; cycleSeconds: number; phaseCount: number }
  | { kind: "error"; message: string };

type PullOutcome =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; at: number; phaseCount: number; isDefault: boolean }
  | { kind: "error"; message: string };

export function SchematicSection({ config }: SchematicSectionProps) {
  const { state, status, lastMessage, refresh } = useIntersectionState(config.id);
  const dispatch = useStudioDispatch();
  const [events, setEvents] = useState<Array<{ ts: string; text: string }>>([]);
  const [apply, setApply] = useState<ApplyOutcome>({ kind: "idle" });
  const [pull, setPull] = useState<PullOutcome>({ kind: "idle" });
  const [hoveredSgId, setHoveredSgId] = useState<string | null>(null);

  // Build a live-aspect lookup keyed by signal group id so the
  // engineering diagram colours every movement from the real
  // controller output (red / yellow / green) on top of the
  // configured geometry.
  const liveAspects = useMemo<Map<string, SignalAspect> | undefined>(() => {
    if (!state) return undefined;
    const map = new Map<string, SignalAspect>();
    for (const group of state.signalGroups) {
      map.set(group.id, group.aspect);
    }
    return map;
  }, [state]);

  // Resolve each runtime detector to its engineering approach so it
  // sits on the right leg of the carrefour, even when the
  // intersection has 5-, 6- or 8-way geometry. Fall back to the
  // runtime-reported cardinal bearing when no config mapping exists.
  const liveDetectors = useMemo(() => {
    if (!state) return undefined;
    const detectorById = new Map(
      config.detectors.map((det) => [det.id, det]),
    );
    const approachById = new Map(
      config.approaches.map((approach) => [approach.id, approach]),
    );
    return state.detectors.map((det) => {
      const configDet = detectorById.get(det.id);
      const bearing =
        (configDet?.approachId
          ? approachById.get(configDet.approachId)?.bearing
          : undefined) ?? (det.approachBearing as ApproachBearing);
      return {
        id: det.id,
        approachBearing: bearing,
        active: det.active,
        label: configDet?.label,
      };
    });
  }, [state, config.detectors, config.approaches]);

  useEffect(() => {
    if (pull.kind !== "success") return;
    const id = window.setTimeout(() => setPull({ kind: "idle" }), 3500);
    return () => window.clearTimeout(id);
  }, [pull]);
  const lastPhaseRef = useRef<string | null>(null);
  const lastStateRef = useRef<PhaseState | null>(null);
  const lastForcedRef = useRef<string | null>(null);
  const lastOverrideRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (apply.kind !== "success") return;
    const id = window.setTimeout(() => setApply({ kind: "idle" }), 3500);
    return () => window.clearTimeout(id);
  }, [apply]);

  const handleApplyConfig = async () => {
    setApply({ kind: "pending" });
    try {
      const payload = studioConfigToRuntimePayload(config);
      const nextState = await applyIntersectionConfig(config.id, payload);
      setApply({
        kind: "success",
        at: Date.now(),
        cycleSeconds: nextState.cycleSeconds,
        phaseCount: new Set(
          nextState.orderedSlices.map((slice) => slice.phaseId),
        ).size,
      });
      setEvents((current) =>
        [
          {
            ts: formatStamp(),
            text: `Config applied · cycle ${nextState.cycleSeconds}s · ${nextState.orderedSlices.length} slice(s)`,
          },
          ...current,
        ].slice(0, 12),
      );
      await refresh();
    } catch (error) {
      const message =
        error instanceof CommandPlatformApiError
          ? error.detail
          : error instanceof Error
            ? error.message
            : "Apply failed";
      setApply({ kind: "error", message });
      setEvents((current) =>
        [
          { ts: formatStamp(), text: `✗ Apply to runtime failed — ${message}` },
          ...current,
        ].slice(0, 12),
      );
    }
  };

  const handlePullConfig = async () => {
    setPull({ kind: "pending" });
    try {
      const runtimeConfig = await fetchIntersectionConfig(config.id);
      const next = runtimeConfigToStudioConfig(config.id, runtimeConfig, config);
      dispatch({
        type: "replaceIntersection",
        intersectionId: config.id,
        config: next,
        markBaseline: true,
      });
      setPull({
        kind: "success",
        at: Date.now(),
        phaseCount: runtimeConfig.phases.length,
        isDefault: runtimeConfig.isDefault,
      });
      setEvents((current) =>
        [
          {
            ts: formatStamp(),
            text: `Config pulled · ${runtimeConfig.phases.length} phase(s)${
              runtimeConfig.isDefault ? " (backend default)" : ""
            }`,
          },
          ...current,
        ].slice(0, 12),
      );
    } catch (error) {
      const message =
        error instanceof CommandPlatformApiError
          ? error.detail
          : error instanceof Error
            ? error.message
            : "Pull failed";
      setPull({ kind: "error", message });
      setEvents((current) =>
        [
          { ts: formatStamp(), text: `✗ Pull from runtime failed — ${message}` },
          ...current,
        ].slice(0, 12),
      );
    }
  };

  useEffect(() => {
    if (!state) return;
    const log = (text: string) => {
      setEvents((current) => [{ ts: formatStamp(), text }, ...current].slice(0, 12));
    };

    if (
      state.commands.forcedPhaseId !== lastForcedRef.current &&
      lastForcedRef.current !== null
    ) {
      log(
        state.commands.forcedPhaseId
          ? `Force phase → ${state.commands.forcedPhaseId}`
          : "Force phase cleared",
      );
    }
    lastForcedRef.current = state.commands.forcedPhaseId;

    if (lastOverrideRef.current !== null && state.commands.manualOverride !== lastOverrideRef.current) {
      log(state.commands.manualOverride ? "Override engaged" : "Override released");
    }
    lastOverrideRef.current = state.commands.manualOverride;

    if (state.activePhaseId && state.activePhaseId !== lastPhaseRef.current) {
      log(`Phase → ${state.activePhaseLabel}`);
      lastPhaseRef.current = state.activePhaseId;
    } else if (
      state.phaseState !== "idle" &&
      state.phaseState !== lastStateRef.current
    ) {
      const verb =
        state.phaseState === "yellow"
          ? `Transition: ${state.activePhaseLabel} entering amber`
          : state.phaseState === "red-clearance"
            ? `Transition: ${state.activePhaseLabel} red-clearance`
            : `${state.activePhaseLabel} — green`;
      log(verb);
      lastStateRef.current = state.phaseState;
    }
  }, [state]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-stroke-0 bg-surface-1 px-6 py-3">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-ink-3">
            Schematic · Backend runtime
          </p>
          <h2 className="mt-0.5 text-[1.05rem] font-semibold text-ink-0">
            {config.identity.name}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          {state ? (
            <>
              <PhaseStatePill state={state.phaseState} />
              <span className="rounded-[6px] border border-stroke-1 bg-surface-2 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-sig-yellow-ink">
                {cleanLabel(state.activePhaseLabel)}
              </span>
              <span className="rounded-[6px] border border-stroke-1 bg-surface-2 px-2.5 py-1 font-mono text-[0.72rem] text-accent-ink">
                {formatSecond(state.cycleSecond)} / {formatSecond(state.cycleSeconds)}
              </span>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-[6px] border border-stroke-1 bg-surface-2 px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-ink-1 transition hover:-translate-y-px hover:border-stroke-2 hover:text-ink-0"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handlePullConfig()}
            disabled={pull.kind === "pending"}
            className={clsx(
              "rounded-[6px] border px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
              pull.kind === "success"
                ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
                : pull.kind === "error"
                  ? "border-danger-stroke bg-danger-surface text-danger-ink"
                  : "border-stroke-1 bg-surface-2 text-info-ink hover:border-stroke-2",
              pull.kind === "pending" ? "animate-pulse" : "",
            )}
          >
            {pull.kind === "pending"
              ? "Pulling…"
              : pull.kind === "success"
                ? `Pulled · ${pull.phaseCount} phase${pull.phaseCount === 1 ? "" : "s"}${
                    pull.isDefault ? " (default)" : ""
                  }`
                : pull.kind === "error"
                  ? "Pull failed"
                  : "Pull from runtime"}
          </button>
          <button
            type="button"
            onClick={() => void handleApplyConfig()}
            disabled={apply.kind === "pending"}
            className={clsx(
              "rounded-[6px] border px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
              apply.kind === "success"
                ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
                : apply.kind === "error"
                  ? "border-danger-stroke bg-danger-surface text-danger-ink"
                  : "border-accent-stroke bg-gradient-to-b from-[var(--stls-accent)] to-[var(--stls-accent-ink)] text-accent-surface shadow-[0_3px_10px_rgba(255,181,71,0.22)] hover:brightness-110",
              apply.kind === "pending" ? "animate-pulse" : "",
            )}
          >
            {apply.kind === "pending"
              ? "Applying…"
              : apply.kind === "success"
                ? `Applied · ${apply.cycleSeconds}s cycle`
                : apply.kind === "error"
                  ? "Apply failed"
                  : "Apply to runtime"}
          </button>
        </div>
      </header>

      {apply.kind === "error" ? (
        <div className="border-b border-danger-stroke bg-danger-surface/60 px-6 py-2 text-[0.78rem] text-danger-ink">
          Apply rejected: {apply.message}
        </div>
      ) : null}

      {pull.kind === "error" ? (
        <div className="border-b border-danger-stroke bg-danger-surface/60 px-6 py-2 text-[0.78rem] text-danger-ink">
          Pull failed: {pull.message}
        </div>
      ) : null}

      {status === "error" && lastMessage ? (
        <div className="border-b border-danger-stroke bg-danger-surface/60 px-6 py-2 text-[0.78rem] text-danger-ink">
          Runtime unavailable: {lastMessage}
        </div>
      ) : null}

      <div className="grid flex-1 min-h-0 grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative overflow-hidden bg-canvas">
          <div className="absolute inset-0 p-6">
            {state ? (
              <IntersectionDiagram
                config={config}
                highlightedPhaseId={state.activePhaseId}
                hoveredSignalGroupId={hoveredSgId}
                onHoverSignalGroup={setHoveredSgId}
                showAllConflicts={false}
                liveAspects={liveAspects}
                activePhaseState={state.phaseState}
                animateActiveFlow
                liveDetectors={liveDetectors}
              />
            ) : (
              <EmptyState status={status} />
            )}
          </div>

          {state ? (
            <div className="pointer-events-none absolute left-5 top-5 flex flex-col gap-2">
              <OverviewTile label="Cycle" value={formatSecond(state.cycleSeconds)} />
              <OverviewTile
                label="Slices"
                value={`${state.orderedSlices.length}`}
              />
              {state.commands.forcedPhaseId ? (
                <div className="rounded-[10px] border border-accent-stroke bg-accent-surface/90 px-3 py-2 backdrop-blur">
                  <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-accent-ink">
                    Forced
                  </p>
                  <p className="mt-0.5 font-mono text-[0.82rem] text-sig-yellow-ink">
                    phase {state.commands.forcedPhaseId}
                  </p>
                </div>
              ) : null}
              {state.commands.manualOverride ? (
                <div className="rounded-[10px] border border-danger-stroke bg-danger-surface/90 px-3 py-2 backdrop-blur">
                  <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-danger-ink">
                    Override
                  </p>
                  <p className="mt-0.5 font-mono text-[0.82rem] text-danger-ink">
                    engaged
                    {state.commands.forcedDirection
                      ? ` · force ${state.commands.forcedDirection}`
                      : ""}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {state ? (
            <div className="pointer-events-none absolute left-5 bottom-5 right-5 rounded-[10px] border border-stroke-0 bg-surface-1/85 px-3 py-2 backdrop-blur">
              <CycleBar state={state} />
            </div>
          ) : null}
        </div>

        <aside className="flex min-h-0 flex-col border-l border-stroke-0 bg-surface-1">
          <header className="border-b border-stroke-0 px-3 py-2">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
              Signal groups
            </p>
          </header>
          <ul className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1.5">
            {!state || state.signalGroups.length === 0 ? (
              <li className="text-[0.78rem] text-ink-3">
                {state ? "No signal groups in state." : "Waiting for runtime…"}
              </li>
            ) : (
              state.signalGroups.map((group) => (
                <SignalGroupRow
                  key={group.id}
                  group={group}
                  hovered={group.id === hoveredSgId}
                  onHover={setHoveredSgId}
                />
              ))
            )}
          </ul>

          <div className="border-t border-stroke-0 px-3 py-2">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
              Detectors
            </p>
            <ul className="mt-1.5 space-y-1">
              {!state || state.detectors.length === 0 ? (
                <li className="text-[0.72rem] text-ink-3">No detectors.</li>
              ) : (
                state.detectors.map((detector) => (
                  <li
                    key={detector.id}
                    className="flex items-center gap-2 text-[0.72rem]"
                  >
                    <span
                      aria-hidden
                      className={clsx(
                        "h-1.5 w-1.5 rounded-full",
                        detector.active ? "bg-sig-green" : "bg-stroke-2",
                      )}
                    />
                    <span className="font-mono text-sig-yellow-ink">
                      {detector.id}
                    </span>
                    <span className="text-ink-2">· {detector.approachBearing}</span>
                    <span
                      className={clsx(
                        "ml-auto text-[0.66rem] uppercase tracking-[0.16em]",
                        detector.active ? "text-sig-green-ink" : "text-ink-3",
                      )}
                    >
                      {detector.active ? "active" : "idle"}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="border-t border-stroke-0 px-3 py-2">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
              Events
            </p>
            <ul className="mt-1.5 max-h-[120px] overflow-y-auto space-y-1">
              {events.length === 0 ? (
                <li className="text-[0.72rem] text-ink-3">No events yet.</li>
              ) : (
                events.map((event, index) => (
                  <li
                    key={`${event.ts}-${index}`}
                    className="font-mono text-[0.7rem] text-ink-1"
                  >
                    <span className="text-ink-3">{event.ts}</span>{" "}
                    {event.text}
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SignalGroupRow({
  group,
  hovered,
  onHover,
}: {
  group: SignalGroupState;
  hovered: boolean;
  onHover: (id: string | null) => void;
}) {
  const color =
    group.aspect === "green"
      ? "var(--stls-sig-green)"
      : group.aspect === "yellow"
        ? "var(--stls-sig-yellow)"
        : "var(--stls-sig-red)";
  return (
    <li
      onMouseEnter={() => onHover(group.id)}
      onMouseLeave={() => onHover(null)}
      className={clsx(
        "flex items-center gap-2 rounded-[6px] border bg-surface-2 px-3 py-2 transition-colors",
        hovered
          ? "border-accent-stroke ring-1 ring-accent-stroke"
          : "border-stroke-0",
      )}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[0.78rem] text-sig-yellow-ink">
          {group.id}
        </span>
        <span className="block truncate text-[0.7rem] text-ink-2">
          Approach {group.approachBearing}
        </span>
      </span>
      <span
        className="rounded-[3px] border px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em]"
        style={{
          color,
          borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
          backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
        }}
      >
        {group.aspect}
      </span>
    </li>
  );
}

function CycleBar({ state }: { state: IntersectionRuntimeState }) {
  if (state.cycleSeconds === 0) {
    return (
      <p className="text-[0.72rem] text-ink-3">
        Cycle length is 0 — backend has no configured phases for this intersection.
      </p>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
        <span>Cycle timeline</span>
        <span className="font-mono text-ink-1">
          t = {formatSecond(state.cycleSecond)}
        </span>
      </div>
      <div className="mt-1 flex h-3 w-full overflow-hidden rounded-full border border-stroke-1 bg-surface-2">
        {state.orderedSlices.map((slice) => {
          const ratio = slice.durationSeconds / state.cycleSeconds;
          const isActive = slice.phaseId === state.activePhaseId;
          return (
            <div
              key={slice.phaseId}
              className="relative h-full border-r border-canvas/60 last:border-r-0"
              style={{ width: `${ratio * 100}%` }}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${(slice.minGreenSeconds / slice.durationSeconds) * 100}%`,
                  backgroundColor: isActive
                    ? "var(--stls-sig-green)"
                    : "var(--stls-sig-green-stroke)",
                  opacity: isActive ? 0.9 : 0.55,
                }}
              />
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${(slice.minGreenSeconds / slice.durationSeconds) * 100}%`,
                  width: `${(slice.yellowSeconds / slice.durationSeconds) * 100}%`,
                  backgroundColor: isActive
                    ? "var(--stls-sig-yellow)"
                    : "var(--stls-sig-yellow-stroke)",
                  opacity: isActive ? 0.9 : 0.55,
                }}
              />
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${((slice.minGreenSeconds + slice.yellowSeconds) / slice.durationSeconds) * 100}%`,
                  width: `${(slice.redClearanceSeconds / slice.durationSeconds) * 100}%`,
                  backgroundColor: isActive
                    ? "var(--stls-sig-red)"
                    : "var(--stls-sig-red-stroke)",
                  opacity: isActive ? 0.9 : 0.55,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="relative mt-1 h-1">
        <div
          className="absolute top-0 h-full w-[2px] rounded-full bg-accent"
          style={{
            left: `${(state.cycleSecond / state.cycleSeconds) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "connecting" | "live" | "stale" | "error" }) {
  const tone =
    status === "live"
      ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
      : status === "connecting" || status === "stale"
        ? "border-sig-yellow-stroke bg-sig-yellow-surface text-sig-yellow-ink"
        : "border-danger-stroke bg-danger-surface text-danger-ink";
  const dot =
    status === "live"
      ? "bg-sig-green"
      : status === "connecting" || status === "stale"
        ? "bg-accent"
        : "bg-sig-red";
  const label =
    status === "live"
      ? "Live"
      : status === "connecting"
        ? "Connecting"
        : status === "stale"
          ? "Stale"
          : "Error";
  return (
    <span
      className={clsx(
        "flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.2em]",
        tone,
      )}
    >
      <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function PhaseStatePill({ state }: { state: PhaseState }) {
  const tone =
    state === "green"
      ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
      : state === "yellow"
        ? "border-sig-yellow-stroke bg-sig-yellow-surface text-sig-yellow-ink"
        : state === "red-clearance"
          ? "border-danger-stroke bg-danger-surface text-danger-ink"
          : "border-stroke-1 bg-surface-2 text-ink-2";
  const dot =
    state === "green"
      ? "bg-sig-green-ink"
      : state === "yellow"
        ? "bg-sig-yellow-ink"
        : state === "red-clearance"
          ? "bg-danger-ink"
          : "bg-ink-3";
  const label =
    state === "green"
      ? "Green"
      : state === "yellow"
        ? "Amber"
        : state === "red-clearance"
          ? "Red-clear"
          : "Idle";
  return (
    <span
      className={clsx(
        "flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.2em]",
        tone,
      )}
    >
      <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function OverviewTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-stroke-0 bg-surface-1/85 px-3 py-2 backdrop-blur">
      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[0.92rem] text-accent-ink">{value}</p>
    </div>
  );
}

function EmptyState({ status }: { status: "connecting" | "live" | "stale" | "error" }) {
  return (
    <div className="grid h-full place-items-center px-10 text-center">
      <div className="max-w-md">
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em] text-ink-3">
          Runtime {status}
        </p>
        <h2 className="mt-3 text-[1.2rem] font-semibold text-ink-1">
          Waiting for backend state…
        </h2>
        <p className="mt-2 text-[0.84rem] text-ink-2">
          Make sure the backend is running (<code>npm run dev:backend</code>) so{" "}
          <code>GET /intersections/:id/state</code> responds. The schematic
          updates as soon as the first tick arrives.
        </p>
      </div>
    </div>
  );
}

function formatSecond(seconds: number) {
  if (!Number.isFinite(seconds)) return "0s";
  return `${Math.max(0, Math.floor(seconds))}s`;
}

function formatStamp() {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function cleanLabel(label: string) {
  return label.replace(/^Phase\s*\d*\s*—?\s*/i, "") || label;
}
