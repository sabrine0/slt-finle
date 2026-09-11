"use client";

import clsx from "clsx";

import type { ApproachBearing } from "@/components/studio/state/types";
import type {
  DemandSnapshot,
  DemandSource,
  PhaseRecommendation,
  RankedPhase,
} from "@/components/studio/control-mode/advisory";
import type { OperatorDirection } from "@/types/command-platform";

interface DemandPriorityPanelProps {
  configuredBearings: ApproachBearing[];
  availableDirections: OperatorDirection[];
  demand: DemandSnapshot;
  emergencyRoute: OperatorDirection | null;
  onSetEmergencyRoute: (route: OperatorDirection | null) => void;
  recommendation: PhaseRecommendation | null;
  recommendationDiffersFromCycle: boolean;
  naturalNextPhaseId: string | null;
  /** Full ranked candidate list (sorted by score, descending).  We
   *  show the top three so the operator sees the engine's reasoning,
   *  not just its single pick. */
  priorityList: RankedPhase[];
}

export function DemandPriorityPanel({
  configuredBearings,
  availableDirections,
  demand,
  emergencyRoute,
  onSetEmergencyRoute,
  recommendation,
  recommendationDiffersFromCycle,
  naturalNextPhaseId,
  priorityList,
}: DemandPriorityPanelProps) {
  return (
    <div className="space-y-2.5">
      {/* Emergency route picker */}
      <section>
        <div className="flex items-center justify-between">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
            Emergency route
          </p>
          {emergencyRoute ? (
            <button
              type="button"
              onClick={() => onSetEmergencyRoute(null)}
              className="rounded-[3px] border border-stroke-1 bg-surface-3 px-1.5 py-px text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-ink-2 hover:text-ink-0"
            >
              clear
            </button>
          ) : null}
        </div>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {(["N", "E", "S", "W"] as const).map((direction) => {
            const enabled = availableDirections.includes(direction);
            const active = emergencyRoute === direction;
            return (
              <button
                key={direction}
                type="button"
                disabled={!enabled}
                onClick={() => onSetEmergencyRoute(active ? null : direction)}
                title={
                  enabled
                    ? `Prioritise route ${direction}`
                    : `${direction} not configured`
                }
                className={clsx(
                  "flex h-7 items-center justify-center rounded-[5px] border text-[0.7rem] font-semibold transition",
                  active
                    ? "border-danger-stroke bg-danger-surface text-danger-ink shadow-[inset_0_-2px_0_0_var(--stls-danger-stroke)]"
                    : enabled
                      ? "border-stroke-1 bg-surface-3 text-ink-1 hover:border-stroke-2 hover:text-ink-0"
                      : "border-stroke-0 bg-surface-3 text-ink-3 cursor-not-allowed",
                )}
              >
                {direction}
              </button>
            );
          })}
        </div>
        {emergencyRoute ? (
          <p className="mt-1 text-[0.62rem] leading-4 text-danger-ink">
            Engine will recommend phases that serve {emergencyRoute}.
          </p>
        ) : (
          <p className="mt-1 text-[0.62rem] leading-4 text-ink-3">
            Pick a direction to bias recommendations during an incident.
          </p>
        )}
      </section>

      {/* Demand bars per approach */}
      <section>
        <div className="flex items-center justify-between">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
            Demand per approach
          </p>
          <SourceBadge source={demand.source} />
        </div>
        <ul className="mt-1 space-y-1">
          {configuredBearings.length === 0 ? (
            <li className="text-[0.7rem] text-ink-3">
              No approaches configured.
            </li>
          ) : (
            configuredBearings.map((bearing) => {
              const value = demand.byBearing.get(bearing) ?? 0;
              const queue = demand.queueByBearing.get(bearing) ?? 0;
              const isRoute =
                emergencyRoute &&
                (bearing === "N" ||
                  bearing === "E" ||
                  bearing === "S" ||
                  bearing === "W") &&
                bearing === emergencyRoute;
              const tone =
                value > 0.7 ? "high" : value > 0.4 ? "med" : "low";
              return (
                <li
                  key={bearing}
                  className={clsx(
                    "flex items-center gap-2 rounded-[5px] px-1.5 py-1",
                    isRoute
                      ? "bg-danger-surface/40 ring-1 ring-inset ring-danger-stroke"
                      : "",
                  )}
                >
                  <span className="w-5 font-mono text-[0.7rem] text-ink-1">
                    {bearing}
                  </span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full border border-stroke-1 bg-surface-3">
                    <div
                      className={clsx(
                        "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                        tone === "high"
                          ? "bg-sig-red"
                          : tone === "med"
                            ? "bg-accent"
                            : "bg-sig-green",
                      )}
                      style={{ width: `${Math.round(value * 100)}%` }}
                    />
                  </div>
                  <span className="w-7 text-right font-mono text-[0.66rem] tabular-nums text-ink-2">
                    {queue}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </section>

      {/* Ranked priority list — top three candidate phases with reasons */}
      <section className="rounded-[6px] border border-stroke-1 bg-surface-3 px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-1">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
            Phase priority
          </p>
          {recommendationDiffersFromCycle && naturalNextPhaseId ? (
            <span
              title={`Cycle order would run ${naturalNextPhaseId} next`}
              className="text-[0.58rem] uppercase tracking-[0.16em] text-sig-yellow-ink"
            >
              ≠ cycle ({naturalNextPhaseId})
            </span>
          ) : null}
        </div>
        {priorityList.length === 0 ? (
          <p className="mt-0.5 text-[0.7rem] text-ink-3">
            No candidate phase available.
          </p>
        ) : (
          <ol className="mt-1 space-y-1">
            {priorityList.slice(0, 3).map((entry, index) => (
              <li
                key={entry.phaseId}
                className={clsx(
                  "flex items-start gap-1.5 rounded-[4px] px-1.5 py-1",
                  index === 0
                    ? "border border-accent-stroke bg-accent-surface/70"
                    : "",
                )}
              >
                <span
                  className={clsx(
                    "mt-px font-mono text-[0.6rem] tabular-nums",
                    index === 0 ? "text-accent-ink" : "text-ink-3",
                  )}
                >
                  #{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={clsx(
                        "font-mono text-[0.74rem] font-bold tabular-nums",
                        index === 0 ? "text-accent-ink" : "text-ink-1",
                      )}
                    >
                      {entry.phaseId}
                    </span>
                    {entry.isEmergencyRoute ? (
                      <span className="rounded-[3px] border border-danger-stroke bg-danger-surface px-1 py-px text-[0.5rem] font-semibold uppercase tracking-[0.14em] text-danger-ink">
                        route
                      </span>
                    ) : entry.hasCall ? (
                      <span className="rounded-[3px] border border-sig-green-stroke bg-sig-green-surface px-1 py-px text-[0.5rem] font-semibold uppercase tracking-[0.14em] text-sig-green-ink">
                        call
                      </span>
                    ) : (
                      <span className="rounded-[3px] border border-stroke-1 bg-surface-2 px-1 py-px text-[0.5rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
                        no call
                      </span>
                    )}
                  </div>
                  <p className="text-[0.6rem] leading-4 text-ink-2">
                    {entry.reason}
                  </p>
                </div>
                <span
                  title="Engine score"
                  className={clsx(
                    "font-mono text-[0.6rem] tabular-nums",
                    index === 0 ? "text-accent-ink" : "text-ink-3",
                  )}
                >
                  {entry.score.toFixed(1)}
                </span>
              </li>
            ))}
          </ol>
        )}
        {recommendation && priorityList.length > 0 ? null : (
          // Fallback safety message when nothing is rankable.
          <p className="mt-1 text-[0.6rem] text-ink-3">
            Engine has no actionable candidate.
          </p>
        )}
      </section>
    </div>
  );
}

function SourceBadge({ source }: { source: DemandSource }) {
  // Makes the data source unmistakable:
  //   • green pulse when driven by live runtime detectors
  //   • neutral label when falling back to the deterministic simulator
  const isLive = source === "detectors";
  return (
    <span
      title={
        isLive
          ? "Demand derived from live runtime detector state"
          : "No detectors configured · simulator fallback"
      }
      className={clsx(
        "flex items-center gap-1 rounded-[3px] border px-1.5 py-px text-[0.52rem] font-semibold uppercase tracking-[0.16em]",
        isLive
          ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
          : "border-stroke-1 bg-surface-2 text-ink-2",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          isLive ? "bg-sig-green stls-soft-blink" : "bg-ink-3",
        )}
      />
      {isLive ? "detectors" : "simulator"}
    </span>
  );
}
