"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

import { IntersectionDiagram } from "@/components/studio/intersection-editor/intersection-diagram";
import type { IntersectionConfig, Phase } from "@/components/studio/state/types";

interface DiagramSectionProps {
  config: IntersectionConfig;
}

export function DiagramSection({ config }: DiagramSectionProps) {
  const orderedPhases = useMemo(() => {
    if (config.stages.length === 0) return config.phases;
    const ordered = [...config.stages].sort((a, b) => a.order - b.order);
    const seen = new Set<string>();
    const result: Phase[] = [];
    for (const stage of ordered) {
      if (seen.has(stage.phaseId)) continue;
      const phase = config.phases.find((p) => p.id === stage.phaseId);
      if (phase) {
        result.push(phase);
        seen.add(stage.phaseId);
      }
    }
    for (const phase of config.phases) {
      if (!seen.has(phase.id)) {
        result.push(phase);
        seen.add(phase.id);
      }
    }
    return result;
  }, [config.phases, config.stages]);

  const [highlightedPhaseId, setHighlightedPhaseId] = useState<string | null>(
    () => orderedPhases[0]?.id ?? null,
  );
  const [hoveredSignalGroupId, setHoveredSignalGroupId] = useState<string | null>(
    null,
  );
  const [showAllConflicts, setShowAllConflicts] = useState(false);

  // If the highlighted phase disappears (e.g., user edits config), pick the first available one.
  useEffect(() => {
    if (
      highlightedPhaseId &&
      !orderedPhases.some((p) => p.id === highlightedPhaseId)
    ) {
      const nextPhaseId = orderedPhases[0]?.id ?? null;
      const id = window.requestAnimationFrame(() =>
        setHighlightedPhaseId(nextPhaseId),
      );
      return () => window.cancelAnimationFrame(id);
    }
  }, [orderedPhases, highlightedPhaseId]);

  const cycleSeconds = orderedPhases.reduce(
    (sum, phase) =>
      sum +
      phase.minGreenSeconds +
      phase.yellowSeconds +
      phase.redClearanceSeconds,
    0,
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-stroke-0 bg-surface-1 px-4 py-1.5">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
          Diagram · Static engineering view
        </p>

        <div className="flex items-center gap-2">
          <span className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-ink-2">
            {config.signalGroups.length} SG
          </span>
          <span className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-ink-2">
            {config.phases.length} phase{config.phases.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2.5 py-1 font-mono text-[0.72rem] text-accent-ink">
            {cycleSeconds}s cycle
          </span>
          <button
            type="button"
            onClick={() => setShowAllConflicts((v) => !v)}
            className={clsx(
              "rounded-[6px] border px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] transition hover:-translate-y-px",
              showAllConflicts
                ? "border-danger-stroke bg-danger-surface text-danger-ink"
                : "border-stroke-1 bg-surface-2 text-ink-1 hover:border-stroke-2 hover:text-ink-0",
            )}
            title="Toggle visualization of all incompatibility pairs"
          >
            {showAllConflicts ? "Conflicts ON" : "Show conflicts"}
          </button>
        </div>
      </header>

      <div className="grid flex-1 min-h-0 grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative overflow-hidden bg-canvas">
          <div className="absolute inset-0 p-4">
            <IntersectionDiagram
              config={config}
              highlightedPhaseId={highlightedPhaseId}
              hoveredSignalGroupId={hoveredSignalGroupId}
              onHoverSignalGroup={setHoveredSignalGroupId}
              showAllConflicts={showAllConflicts}
            />
          </div>

          <div className="pointer-events-none absolute left-5 bottom-5 rounded-[10px] border border-stroke-0 bg-surface-1/85 px-3 py-2 backdrop-blur">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
              Legend
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-[0.7rem]">
              <LegendDot tone="green" label="Green (active in phase)" />
              <LegendDot tone="red" label="Red (idle)" />
              <span className="flex items-center gap-1.5 text-ink-1">
                <span
                  aria-hidden
                  className="inline-block h-px w-6 border-t border-dashed border-danger"
                />
                Conflict
              </span>
            </div>
          </div>

          {hoveredSignalGroupId ? (
            <div className="pointer-events-none absolute right-5 top-5 rounded-[10px] border border-stroke-0 bg-surface-1/90 px-3 py-2 backdrop-blur">
              <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
                Hovering
              </p>
              <p className="mt-0.5 font-mono text-[0.86rem] text-accent-ink">
                {hoveredSignalGroupId}
              </p>
              {(() => {
                const conflictsForHovered = config.conflicts.filter(
                  (pair) =>
                    pair.a === hoveredSignalGroupId ||
                    pair.b === hoveredSignalGroupId,
                );
                return conflictsForHovered.length > 0 ? (
                  <p className="mt-1 text-[0.66rem] text-danger-ink">
                    {conflictsForHovered.length} conflict
                    {conflictsForHovered.length === 1 ? "" : "s"}
                  </p>
                ) : (
                  <p className="mt-1 text-[0.66rem] text-sig-green-ink">
                    No conflicts
                  </p>
                );
              })()}
            </div>
          ) : null}
        </div>

        <aside className="flex min-h-0 flex-col border-l border-stroke-0 bg-surface-1">
          <header className="border-b border-stroke-0 px-3 py-2">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
              Phases
            </p>
            <p className="mt-0.5 text-[0.7rem] text-ink-2">
              Click a phase to highlight its greens on the diagram
            </p>
          </header>

          <ul className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1.5">
            {orderedPhases.length === 0 ? (
              <li className="text-[0.78rem] text-ink-3 px-1 py-2">
                No phases defined. Add phases in the Phases &amp; Stages section.
              </li>
            ) : (
              orderedPhases.map((phase, index) => {
                const active = highlightedPhaseId === phase.id;
                const phaseDuration =
                  phase.minGreenSeconds +
                  phase.yellowSeconds +
                  phase.redClearanceSeconds;
                return (
                  <li key={phase.id}>
                    <button
                      type="button"
                      onClick={() => setHighlightedPhaseId(phase.id)}
                      className={clsx(
                        "group flex w-full items-start gap-2.5 rounded-[8px] border px-2.5 py-2 text-left transition hover:-translate-y-px",
                        active
                          ? "border-accent-stroke bg-accent-surface"
                          : "border-stroke-0 bg-surface-2 hover:border-stroke-1 hover:bg-surface-3",
                      )}
                    >
                      <span
                        className={clsx(
                          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[4px] font-mono text-[0.66rem] font-bold",
                          active
                            ? "bg-accent-surface text-accent-ink"
                            : "bg-surface-3 text-ink-3 group-hover:text-ink-1",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={clsx(
                            "block truncate font-mono text-[0.78rem] font-semibold",
                            active ? "text-accent-ink" : "text-sig-yellow-ink",
                          )}
                        >
                          {phase.id}
                        </span>
                        <span className="block truncate text-[0.7rem] text-ink-2">
                          {phase.label}
                        </span>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {phase.greenSignalGroupIds.length === 0 ? (
                            <span className="text-[0.62rem] text-ink-3">
                              no greens
                            </span>
                          ) : (
                            phase.greenSignalGroupIds.map((id) => (
                              <span
                                key={id}
                                className="rounded-[3px] border border-sig-green-stroke bg-sig-green-surface px-1 py-px text-[0.6rem] font-mono font-semibold text-sig-green-ink"
                              >
                                {id}
                              </span>
                            ))
                          )}
                        </div>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5 text-[0.62rem] text-ink-3">
                        <span className="font-mono text-accent-ink">
                          {phaseDuration}s
                        </span>
                        <span>
                          {phase.minGreenSeconds}/{phase.yellowSeconds}/
                          {phase.redClearanceSeconds}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="border-t border-stroke-0 px-3 py-2">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
              Conflicts ({config.conflicts.length})
            </p>
            <p className="mt-1 text-[0.66rem] leading-5 text-ink-2">
              {config.conflicts.length === 0
                ? "No conflict pairs declared yet."
                : "Hover any movement on the diagram to see its conflicts. Toggle “Show conflicts” to display all at once."}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function LegendDot({ tone, label }: { tone: "green" | "red"; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-1">
      <span
        aria-hidden
        className={clsx(
          "inline-block h-2 w-2 rounded-full",
          tone === "green" ? "bg-sig-green" : "bg-sig-red",
        )}
      />
      {label}
    </span>
  );
}
