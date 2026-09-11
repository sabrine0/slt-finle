"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  activateCorridorScenario,
  getCorridorRuntime,
  releaseCorridorControl,
  sendCorridorOverride,
} from "@/lib/corridors-api";
import type {
  ActivateCorridorScenarioPayload,
  CorridorControlKind,
  CorridorIntersectionRuntimeView,
  CorridorOverridePayload,
  CorridorReasonCode,
  CorridorRuntimeSnapshot,
  CorridorScenarioCode,
} from "@/types/corridors";

const SCENARIO_LABELS: Record<CorridorScenarioCode, string> = {
  normal_traffic: "Normal traffic",
  peak_traffic: "Peak traffic",
  police_diversion: "Police diversion",
  event_egress: "Event egress",
  emergency_clear_path: "Emergency clear path",
};

const SCENARIO_DESCRIPTIONS: Record<CorridorScenarioCode, string> = {
  normal_traffic: "Adaptive mode on every intersection, default cycle.",
  peak_traffic: "Adaptive mode biased for heavier flows.",
  police_diversion: "Manual mode + forced green on primary bearing.",
  event_egress: "Fixed-time cycle optimised for exiting crowds.",
  emergency_clear_path:
    "Emergency mode on every intersection + green wave on the primary bearing. Outranks AI.",
};

const CONTROL_KIND_LABELS: Record<CorridorControlKind, string> = {
  single_intersection: "Single intersection",
  full_corridor: "Full corridor",
  direction_priority: "Direction priority",
  emergency_green_corridor: "Emergency green corridor",
};

const REASON_OPTIONS: { value: CorridorReasonCode; label: string }[] = [
  { value: "police_operation", label: "Police operation" },
  { value: "emergency_vehicle", label: "Emergency vehicle" },
  { value: "incident", label: "Incident" },
  { value: "event", label: "Planned event" },
  { value: "congestion_relief", label: "Congestion relief" },
  { value: "maintenance", label: "Maintenance" },
  { value: "drill", label: "Drill" },
  { value: "other", label: "Other" },
];

interface CorridorSupervisionProps {
  corridorId: string;
  initialSnapshot: CorridorRuntimeSnapshot | null;
  initialError: string | null;
}

export function CorridorSupervision({
  corridorId,
  initialSnapshot,
  initialError,
}: CorridorSupervisionProps) {
  const [snapshot, setSnapshot] = useState<CorridorRuntimeSnapshot | null>(
    initialSnapshot,
  );
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [selectedScenario, setSelectedScenario] =
    useState<CorridorScenarioCode>("normal_traffic");
  const [scenarioReason, setScenarioReason] =
    useState<CorridorReasonCode>("congestion_relief");
  const [scenarioNote, setScenarioNote] = useState("");

  const [overrideKind, setOverrideKind] =
    useState<CorridorControlKind>("full_corridor");
  const [overrideReason, setOverrideReason] =
    useState<CorridorReasonCode>("police_operation");
  const [overrideTarget, setOverrideTarget] = useState<string>("");
  const [overrideBearing, setOverrideBearing] =
    useState<"" | "N" | "E" | "S" | "W">("");
  const [overrideNote, setOverrideNote] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await getCorridorRuntime(corridorId);
      setSnapshot(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Runtime fetch failed");
    }
  }, [corridorId]);

  useEffect(() => {
    const handle = setInterval(() => void refresh(), 3000);
    return () => clearInterval(handle);
  }, [refresh]);

  useEffect(() => {
    if (!snapshot) return;
    setSelectedScenario(snapshot.corridor.activeScenarioCode);
    if (snapshot.corridor.intersections[0]) {
      setOverrideTarget((current) =>
        current || snapshot.corridor.intersections[0]!.intersectionCode,
      );
    }
  }, [snapshot]);

  const corridor = snapshot?.corridor;
  const intersections = snapshot?.intersections ?? [];
  const activeSessions = snapshot?.activeSessions ?? [];
  const recentSessions = snapshot?.recentSessions ?? [];

  const handleActivateScenario = async () => {
    if (!corridor) return;
    setBusy(true);
    try {
      const payload: ActivateCorridorScenarioPayload = {
        scenarioCode: selectedScenario,
        reasonCode: scenarioReason,
        note: scenarioNote.trim() || undefined,
      };
      const next = await activateCorridorScenario(corridor.id, payload);
      setSnapshot(next.snapshot);
      setError(null);
      setScenarioNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleOverride = async () => {
    if (!corridor) return;
    setBusy(true);
    try {
      const payload: CorridorOverridePayload = {
        controlKind: overrideKind,
        reasonCode: overrideReason,
        note: overrideNote.trim() || undefined,
      };
      if (
        overrideKind === "single_intersection" ||
        overrideKind === "direction_priority"
      ) {
        payload.targetIntersectionCode = overrideTarget || undefined;
      }
      if (overrideKind === "direction_priority" && overrideBearing) {
        payload.targetBearing = overrideBearing;
      }
      const next = await sendCorridorOverride(corridor.id, payload);
      setSnapshot(next.snapshot);
      setError(null);
      setOverrideNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override dispatch failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRelease = async (sessionId?: string) => {
    if (!corridor) return;
    setBusy(true);
    try {
      const next = await releaseCorridorControl(corridor.id, {
        sessionId,
        note: scenarioNote.trim() || undefined,
      });
      setSnapshot(next.snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed");
    } finally {
      setBusy(false);
    }
  };

  const coordinationBadge = useMemo(() => {
    if (!snapshot) return null;
    const map: Record<
      CorridorRuntimeSnapshot["coordinationHealth"],
      { label: string; className: string }
    > = {
      aligned: {
        label: "Coordinated",
        className: "bg-sig-green-surface text-sig-green-ink",
      },
      drifting: {
        label: "Drifting",
        className: "bg-sig-yellow-surface text-sig-yellow-ink",
      },
      unknown: {
        label: "Awaiting telemetry",
        className: "bg-surface-2 text-ink-2",
      },
    };
    return map[snapshot.coordinationHealth];
  }, [snapshot]);

  return (
    <main className="min-h-screen bg-surface-0 text-ink-1">
      <header className="border-b border-stroke-0 bg-surface-1 px-6 py-4">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
              <Link href="/studio" className="hover:text-ink-1">
                STLS Studio
              </Link>
              <span aria-hidden>›</span>
              <span className="text-ink-2">Corridors</span>
            </div>
            <h1 className="mt-1 text-[1.35rem] font-semibold text-ink-0">
              {corridor?.name ?? "Corridor supervision"}
            </h1>
            <p className="text-[0.78rem] text-ink-2">
              {corridor?.description ??
                "Live corridor coordination, police operations, and emergency dispatch."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {coordinationBadge ? (
              <span
                className={clsx(
                  "rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em]",
                  coordinationBadge.className,
                )}
              >
                {coordinationBadge.label}
              </span>
            ) : null}
            {corridor ? (
              <span className="rounded-full border border-accent-stroke bg-accent-surface px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-accent-ink">
                {SCENARIO_LABELS[corridor.activeScenarioCode]}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-[6px] border border-stroke-0 bg-surface-1 px-3 py-1.5 text-[0.72rem] font-semibold text-ink-1 hover:bg-hover"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-auto mt-4 max-w-[1400px] px-6">
          <div className="rounded-[6px] border border-danger-stroke bg-danger-surface px-3 py-2 text-[0.78rem] text-danger-ink">
            {error}
          </div>
        </div>
      ) : null}

      {!snapshot ? (
        <div className="mx-auto max-w-[1400px] px-6 py-12 text-center text-ink-3">
          {initialError ? "Unable to load corridor." : "Loading corridor runtime…"}
        </div>
      ) : (
        <div className="mx-auto grid max-w-[1400px] gap-6 px-6 py-6 lg:grid-cols-[2fr_1fr]">
          <section className="flex flex-col gap-4">
            <CorridorStrip intersections={intersections} />
            <IntersectionCards intersections={intersections} />
          </section>
          <aside className="flex flex-col gap-4">
            <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-4">
              <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                Corridor scenario
              </h2>
              <p className="mt-1 text-[0.78rem] text-ink-2">
                {SCENARIO_DESCRIPTIONS[selectedScenario]}
              </p>
              <label className="mt-3 block text-[0.72rem] font-semibold text-ink-2">
                Scenario
                <select
                  value={selectedScenario}
                  onChange={(event) =>
                    setSelectedScenario(
                      event.target.value as CorridorScenarioCode,
                    )
                  }
                  className="mt-1 w-full rounded-[6px] border border-stroke-0 bg-surface-0 px-2 py-1.5 text-[0.82rem] text-ink-1"
                >
                  {corridor?.availableScenarioCodes.map((code) => (
                    <option key={code} value={code}>
                      {SCENARIO_LABELS[code]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-[0.72rem] font-semibold text-ink-2">
                Reason
                <select
                  value={scenarioReason}
                  onChange={(event) =>
                    setScenarioReason(event.target.value as CorridorReasonCode)
                  }
                  className="mt-1 w-full rounded-[6px] border border-stroke-0 bg-surface-0 px-2 py-1.5 text-[0.82rem] text-ink-1"
                >
                  {REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-[0.72rem] font-semibold text-ink-2">
                Note (optional)
                <textarea
                  value={scenarioNote}
                  onChange={(event) => setScenarioNote(event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-[6px] border border-stroke-0 bg-surface-0 px-2 py-1.5 text-[0.82rem] text-ink-1"
                  placeholder="Explain why this scenario is being activated"
                />
              </label>
              <button
                type="button"
                onClick={handleActivateScenario}
                disabled={busy}
                className="mt-3 w-full rounded-[6px] bg-accent-ink px-3 py-2 text-[0.82rem] font-semibold text-surface-0 hover:bg-accent-ink/90 disabled:opacity-50"
              >
                Activate scenario
              </button>
            </section>

            <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-4">
              <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                Police / emergency override
              </h2>
              <p className="mt-1 text-[0.78rem] text-ink-2">
                Direct control. Emergency override outranks AI recommendations.
              </p>
              <label className="mt-3 block text-[0.72rem] font-semibold text-ink-2">
                Operation kind
                <select
                  value={overrideKind}
                  onChange={(event) =>
                    setOverrideKind(event.target.value as CorridorControlKind)
                  }
                  className="mt-1 w-full rounded-[6px] border border-stroke-0 bg-surface-0 px-2 py-1.5 text-[0.82rem] text-ink-1"
                >
                  {(
                    [
                      "single_intersection",
                      "full_corridor",
                      "direction_priority",
                      "emergency_green_corridor",
                    ] as CorridorControlKind[]
                  ).map((kind) => (
                    <option key={kind} value={kind}>
                      {CONTROL_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
              {(overrideKind === "single_intersection" ||
                overrideKind === "direction_priority") && (
                <label className="mt-3 block text-[0.72rem] font-semibold text-ink-2">
                  Target intersection
                  <select
                    value={overrideTarget}
                    onChange={(event) => setOverrideTarget(event.target.value)}
                    className="mt-1 w-full rounded-[6px] border border-stroke-0 bg-surface-0 px-2 py-1.5 text-[0.82rem] text-ink-1"
                  >
                    {corridor?.intersections.map((entry) => (
                      <option
                        key={entry.intersectionCode}
                        value={entry.intersectionCode}
                      >
                        #{entry.orderIndex + 1} · {entry.name ?? entry.intersectionCode}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {overrideKind === "direction_priority" && (
                <label className="mt-3 block text-[0.72rem] font-semibold text-ink-2">
                  Bearing
                  <select
                    value={overrideBearing}
                    onChange={(event) =>
                      setOverrideBearing(
                        event.target.value as "" | "N" | "E" | "S" | "W",
                      )
                    }
                    className="mt-1 w-full rounded-[6px] border border-stroke-0 bg-surface-0 px-2 py-1.5 text-[0.82rem] text-ink-1"
                  >
                    <option value="">Use intersection default</option>
                    {(["N", "E", "S", "W"] as const).map((bearing) => (
                      <option key={bearing} value={bearing}>
                        {bearing}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="mt-3 block text-[0.72rem] font-semibold text-ink-2">
                Reason
                <select
                  value={overrideReason}
                  onChange={(event) =>
                    setOverrideReason(event.target.value as CorridorReasonCode)
                  }
                  className="mt-1 w-full rounded-[6px] border border-stroke-0 bg-surface-0 px-2 py-1.5 text-[0.82rem] text-ink-1"
                >
                  {REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-[0.72rem] font-semibold text-ink-2">
                Note (optional)
                <textarea
                  value={overrideNote}
                  onChange={(event) => setOverrideNote(event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-[6px] border border-stroke-0 bg-surface-0 px-2 py-1.5 text-[0.82rem] text-ink-1"
                  placeholder="Operational detail for the audit log"
                />
              </label>
              <button
                type="button"
                onClick={handleOverride}
                disabled={busy}
                className={clsx(
                  "mt-3 w-full rounded-[6px] px-3 py-2 text-[0.82rem] font-semibold text-surface-0 disabled:opacity-50",
                  overrideKind === "emergency_green_corridor"
                    ? "bg-danger-ink hover:bg-danger-ink/90"
                    : "bg-sig-yellow-ink hover:bg-sig-yellow-ink/90",
                )}
              >
                Dispatch override
              </button>
            </section>

            <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                  Active sessions
                </h2>
                {activeSessions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleRelease()}
                    disabled={busy}
                    className="rounded-[6px] border border-stroke-0 bg-surface-0 px-2 py-1 text-[0.7rem] font-semibold text-ink-1 hover:bg-hover disabled:opacity-50"
                  >
                    Release all
                  </button>
                )}
              </div>
              {activeSessions.length === 0 ? (
                <p className="mt-2 text-[0.78rem] text-ink-3">
                  No active corridor sessions. Automatic control is in effect.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {activeSessions.map((session) => (
                    <li
                      key={session.id}
                      className="rounded-[6px] border border-stroke-0 bg-surface-0 p-2 text-[0.78rem] text-ink-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {CONTROL_KIND_LABELS[session.controlKind]}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleRelease(session.id)}
                          disabled={busy}
                          className="rounded-[4px] border border-stroke-0 bg-surface-1 px-2 py-0.5 text-[0.68rem] font-semibold text-ink-1 hover:bg-hover disabled:opacity-50"
                        >
                          Release
                        </button>
                      </div>
                      <p className="mt-1 text-ink-2">
                        Reason: {session.reasonCode}
                        {session.outranksAi && (
                          <span className="ml-1 rounded-[3px] bg-danger-surface px-1 py-px text-[0.6rem] font-semibold uppercase tracking-wider text-danger-ink">
                            Outranks AI
                          </span>
                        )}
                      </p>
                      {session.note ? (
                        <p className="mt-1 text-[0.72rem] text-ink-3">
                          {session.note}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[0.68rem] text-ink-3">
                        Started {new Date(session.startedAt).toLocaleTimeString()}
                        {session.expectedEndAt
                          ? ` · expires ${new Date(session.expectedEndAt).toLocaleTimeString()}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-4">
              <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                Recent sessions
              </h2>
              {recentSessions.length === 0 ? (
                <p className="mt-2 text-[0.78rem] text-ink-3">No history yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 text-[0.74rem]">
                  {recentSessions.slice(0, 12).map((session) => (
                    <li
                      key={session.id}
                      className="flex items-center justify-between gap-2 border-b border-stroke-0 pb-1 last:border-0"
                    >
                      <span className="truncate">
                        {CONTROL_KIND_LABELS[session.controlKind]}
                        {session.scenarioCode
                          ? ` · ${SCENARIO_LABELS[session.scenarioCode]}`
                          : ""}
                      </span>
                      <span
                        className={clsx(
                          "shrink-0 rounded-[3px] px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wider",
                          session.status === "active"
                            ? "bg-sig-green-surface text-sig-green-ink"
                            : session.status === "released"
                              ? "bg-surface-2 text-ink-2"
                              : "bg-sig-yellow-surface text-sig-yellow-ink",
                        )}
                      >
                        {session.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

function CorridorStrip({
  intersections,
}: {
  intersections: CorridorIntersectionRuntimeView[];
}) {
  if (intersections.length === 0) return null;
  return (
    <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-4">
      <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
        Corridor strip
      </h2>
      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
        {intersections.map((entry, index) => (
          <div key={entry.intersectionCode} className="flex items-center">
            <div className="flex min-w-[180px] flex-col rounded-[6px] border border-stroke-0 bg-surface-0 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
                  #{entry.orderIndex + 1}
                </span>
                <PhaseIndicator state={entry.phaseState} />
              </div>
              <p className="mt-1 truncate text-[0.82rem] font-semibold text-ink-1">
                {entry.name ?? entry.intersectionCode}
              </p>
              <p className="truncate text-[0.68rem] text-ink-3">
                {entry.controllerCode ?? "Controller: —"}
              </p>
              <p className="mt-1 text-[0.72rem] text-ink-2">
                {entry.activePhaseLabel} · {entry.secondsRemainingInPhaseState}s
                left
              </p>
              <p className="text-[0.68rem] text-ink-3">
                Offset {entry.effectiveOffsetSeconds}s / planned{" "}
                {entry.plannedOffsetSeconds}s
              </p>
            </div>
            {index < intersections.length - 1 ? (
              <span aria-hidden className="mx-1 text-ink-3">
                →
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function IntersectionCards({
  intersections,
}: {
  intersections: CorridorIntersectionRuntimeView[];
}) {
  if (intersections.length === 0) {
    return (
      <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-6 text-[0.82rem] text-ink-3">
        This corridor has no intersections yet.
      </section>
    );
  }
  return (
    <section className="grid gap-3 md:grid-cols-2">
      {intersections.map((entry) => (
        <article
          key={entry.intersectionCode}
          className="rounded-[8px] border border-stroke-0 bg-surface-1 p-4"
        >
          <header className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
                Step {entry.orderIndex + 1}
              </p>
              <h3 className="text-[0.92rem] font-semibold text-ink-0">
                {entry.name ?? entry.intersectionCode}
              </h3>
              <p className="text-[0.72rem] text-ink-3">
                {entry.controllerCode ?? "No controller linked"}
                {entry.controllerType ? ` · ${entry.controllerType}` : ""}
              </p>
            </div>
            <ConnectionBadge state={entry.controllerConnectionState} />
          </header>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[0.78rem]">
            <div>
              <p className="text-ink-3">Phase</p>
              <p className="font-semibold text-ink-1">{entry.activePhaseLabel}</p>
              <p className="text-ink-3">
                {entry.phaseState} · {entry.secondsRemainingInPhaseState}s left
              </p>
            </div>
            <div>
              <p className="text-ink-3">Cycle</p>
              <p className="font-semibold text-ink-1">
                {entry.cycleSecond}s / {entry.cycleSeconds}s
              </p>
              <p className="text-ink-3">
                Offset {entry.effectiveOffsetSeconds}s (planned{" "}
                {entry.plannedOffsetSeconds}s)
              </p>
            </div>
          </div>
          {entry.signalGroups.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-[0.7rem]">
              {entry.signalGroups.map((group) => (
                <span
                  key={group.id}
                  className={clsx(
                    "rounded-[4px] px-1.5 py-0.5 font-semibold uppercase",
                    group.aspect === "green"
                      ? "bg-sig-green-surface text-sig-green-ink"
                      : group.aspect === "yellow"
                        ? "bg-sig-yellow-surface text-sig-yellow-ink"
                        : "bg-surface-2 text-ink-2",
                  )}
                >
                  {group.approachBearing} · {group.aspect}
                </span>
              ))}
            </div>
          ) : null}
          {entry.modeOverride ||
          entry.manualOverride ||
          entry.forcedDirection ? (
            <div className="mt-3 flex flex-wrap gap-1 text-[0.68rem]">
              {entry.modeOverride ? (
                <span className="rounded-[3px] bg-accent-surface px-1.5 py-0.5 font-semibold text-accent-ink">
                  mode: {entry.modeOverride}
                </span>
              ) : null}
              {entry.manualOverride ? (
                <span className="rounded-[3px] bg-warning-surface px-1.5 py-0.5 font-semibold text-warning-ink">
                  manual
                </span>
              ) : null}
              {entry.forcedDirection ? (
                <span className="rounded-[3px] bg-sig-green-surface px-1.5 py-0.5 font-semibold text-sig-green-ink">
                  force-green {entry.forcedDirection}
                </span>
              ) : null}
            </div>
          ) : null}
          {entry.dispatchError ? (
            <p className="mt-3 rounded-[6px] bg-danger-surface px-2 py-1 text-[0.72rem] text-danger-ink">
              {entry.dispatchError}
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function PhaseIndicator({ state }: { state: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    green: { bg: "bg-sig-green-ink", label: "Green" },
    yellow: { bg: "bg-sig-yellow-ink", label: "Yellow" },
    "red-clearance": { bg: "bg-danger-ink", label: "All-red" },
    idle: { bg: "bg-surface-2", label: "Idle" },
  };
  const entry = map[state] ?? map.idle!;
  return (
    <span className="inline-flex items-center gap-1 text-[0.66rem] text-ink-3">
      <span
        aria-hidden
        className={clsx("h-2 w-2 rounded-full", entry.bg)}
      />
      {entry.label}
    </span>
  );
}

function ConnectionBadge({ state }: { state: string | null }) {
  const normalised = (state ?? "unknown").toLowerCase();
  const map: Record<string, string> = {
    online: "bg-sig-green-surface text-sig-green-ink",
    degraded: "bg-sig-yellow-surface text-sig-yellow-ink",
    offline: "bg-danger-surface text-danger-ink",
    unknown: "bg-surface-2 text-ink-3",
  };
  const className = map[normalised] ?? map.unknown!;
  return (
    <span
      className={clsx(
        "rounded-[3px] px-1.5 py-0.5 text-[0.64rem] font-semibold uppercase tracking-wider",
        className,
      )}
    >
      {normalised}
    </span>
  );
}
