"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

import {
  GhostButton,
  PrimaryButton,
  SectionToolbar,
  StudioInput,
} from "@/components/studio/intersection-editor/form-controls";
import { useStudioDispatch } from "@/components/studio/state/store";
import type {
  ConflictPair,
  IntersectionConfig,
  Phase,
  Stage,
} from "@/components/studio/state/types";

interface PhaseViolation {
  phaseId: string;
  phaseLabel: string;
  a: string;
  b: string;
}

function pairsEqual(pair: ConflictPair, a: string, b: string) {
  return (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a);
}

function hasConflict(conflicts: ConflictPair[], a: string, b: string) {
  return conflicts.some((pair) => pairsEqual(pair, a, b));
}

function computeViolations(config: IntersectionConfig): PhaseViolation[] {
  const violations: PhaseViolation[] = [];
  for (const phase of config.phases) {
    const ids = phase.greenSignalGroupIds;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        if (hasConflict(config.conflicts, ids[i], ids[j])) {
          violations.push({
            phaseId: phase.id,
            phaseLabel: phase.label,
            a: ids[i],
            b: ids[j],
          });
        }
      }
    }
  }
  return violations;
}

export function PhasesSection({ config }: { config: IntersectionConfig }) {
  const dispatch = useStudioDispatch();
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);

  const violations = useMemo(() => computeViolations(config), [config]);
  const orderedStages = useMemo(
    () => [...config.stages].sort((a, b) => a.order - b.order),
    [config.stages],
  );

  const groupLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of config.signalGroups) map.set(group.id, group.label);
    return map;
  }, [config.signalGroups]);

  const phaseLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const phase of config.phases) map.set(phase.id, phase.label);
    return map;
  }, [config.phases]);

  const addPhase = () => {
    const nextIndex = config.phases.length + 1;
    const id = `ph-${nextIndex}`;
    const phase: Phase = {
      id,
      label: `Phase ${nextIndex}`,
      greenSignalGroupIds: [],
      minGreenSeconds: 10,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    };
    dispatch({ type: "addPhase", intersectionId: config.id, phase });
    setEditingPhaseId(id);
  };

  const addStage = () => {
    if (config.phases.length === 0) return;
    const nextOrder =
      config.stages.length === 0
        ? 1
        : Math.max(...config.stages.map((stage) => stage.order)) + 1;
    const id = `st-${nextOrder}-${Date.now().toString(36).slice(-3)}`;
    const stage: Stage = {
      id,
      label: `Stage ${nextOrder}`,
      phaseId: config.phases[0].id,
      order: nextOrder,
    };
    dispatch({ type: "addStage", intersectionId: config.id, stage });
  };

  const toggleGreenGroup = (phase: Phase, groupId: string) => {
    const has = phase.greenSignalGroupIds.includes(groupId);
    dispatch({
      type: "updatePhase",
      intersectionId: config.id,
      phaseId: phase.id,
      patch: {
        greenSignalGroupIds: has
          ? phase.greenSignalGroupIds.filter((id) => id !== groupId)
          : [...phase.greenSignalGroupIds, groupId],
      },
    });
  };

  const cycleLength = config.phases.reduce(
    (sum, phase) =>
      sum + phase.minGreenSeconds + phase.yellowSeconds + phase.redClearanceSeconds,
    0,
  );

  return (
    <section className="flex flex-col gap-6 pb-8">
      <SectionToolbar
        title="Phases & Stages"
        subtitle="A phase declares which signal groups go green; stages order the phases into a cycle. The conflict matrix gates phases that would let two conflicting groups go green together."
        right={
          <div className="flex items-center gap-4">
            <div className="rounded-[6px] border border-stroke-1 bg-surface-2 px-2.5 py-1 text-right">
              <p className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                Cycle
              </p>
              <p className="font-mono text-[0.86rem] text-accent-ink">
                {cycleLength}s
              </p>
            </div>
            {violations.length === 0 ? (
              <span className="flex items-center gap-1.5 rounded-[6px] border border-sig-green-stroke bg-sig-green-surface px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-sig-green-ink">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sig-green" />
                Matrix clean
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-[6px] border border-danger-stroke bg-danger-surface px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-danger-ink">
                <span
                  aria-hidden
                  className="stls-soft-blink h-1.5 w-1.5 rounded-full bg-danger"
                />
                {violations.length} conflict{violations.length === 1 ? "" : "s"}
              </span>
            )}
            <PrimaryButton onClick={addPhase}>+ Add phase</PrimaryButton>
          </div>
        }
      />

      {violations.length > 0 ? (
        <div className="mx-6 rounded-[8px] border border-danger-stroke bg-danger-surface/60 px-4 py-3">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-danger-ink">
            Conflict matrix violations
          </p>
          <ul className="mt-2 space-y-1 text-[0.82rem] text-danger-ink">
            {violations.map((violation, index) => (
              <li key={`${violation.phaseId}-${index}`}>
                <span className="font-mono text-danger-ink">{violation.phaseLabel}</span>
                <span className="mx-2 text-ink-3">·</span>
                <span>
                  {groupLookup.get(violation.a) ?? violation.a}
                </span>{" "}
                and{" "}
                <span>
                  {groupLookup.get(violation.b) ?? violation.b}
                </span>{" "}
                are both green but are marked conflicting.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="px-6">
        <h3 className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-ink-3">
          Phases
        </h3>
        {config.phases.length === 0 ? (
          <p className="mt-3 text-[0.84rem] text-ink-3">
            No phases defined yet.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-[8px] border border-stroke-1">
            <table className="w-full text-left text-[0.82rem]">
              <thead className="bg-surface-2 text-[0.62rem] uppercase tracking-[0.2em] text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">Label</th>
                  <th className="px-3 py-2 font-semibold">Greens</th>
                  <th className="px-3 py-2 font-semibold">Min G</th>
                  <th className="px-3 py-2 font-semibold">Yellow</th>
                  <th className="px-3 py-2 font-semibold">Red clear</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-0">
                {config.phases.map((phase) => {
                  const editing = editingPhaseId === phase.id;
                  return (
                    <tr key={phase.id} className="bg-surface-1 align-top">
                      <td className="px-3 py-2 font-mono text-sig-yellow-ink">{phase.id}</td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioInput
                            value={phase.label}
                            onChange={(value) =>
                              dispatch({
                                type: "updatePhase",
                                intersectionId: config.id,
                                phaseId: phase.id,
                                patch: { label: value },
                              })
                            }
                          />
                        ) : (
                          <span className="text-ink-1">{phase.label}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {config.signalGroups.map((group) => {
                            const on = phase.greenSignalGroupIds.includes(group.id);
                            return (
                              <button
                                key={group.id}
                                type="button"
                                onClick={() => toggleGreenGroup(phase, group.id)}
                                className={clsx(
                                  "rounded-[4px] border px-2 py-0.5 text-[0.66rem] font-semibold tracking-[0.04em] transition",
                                  on
                                    ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
                                    : "border-stroke-1 bg-surface-2 text-ink-3 hover:border-stroke-2 hover:text-ink-1",
                                )}
                              >
                                {group.id}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      {(
                        ["minGreenSeconds", "yellowSeconds", "redClearanceSeconds"] as const
                      ).map((field) => (
                        <td key={field} className="px-3 py-2">
                          {editing ? (
                            <StudioInput
                              type="number"
                              value={phase[field]}
                              onChange={(value) =>
                                dispatch({
                                  type: "updatePhase",
                                  intersectionId: config.id,
                                  phaseId: phase.id,
                                  patch: {
                                    [field]: Math.max(0, Math.min(120, Number(value) || 0)),
                                  },
                                })
                              }
                            />
                          ) : (
                            <span className="font-mono text-ink-1">{phase[field]}s</span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <GhostButton
                            onClick={() =>
                              setEditingPhaseId(editing ? null : phase.id)
                            }
                          >
                            {editing ? "Done" : "Edit"}
                          </GhostButton>
                          <GhostButton
                            tone="danger"
                            onClick={() =>
                              dispatch({
                                type: "deletePhase",
                                intersectionId: config.id,
                                phaseId: phase.id,
                              })
                            }
                          >
                            Delete
                          </GhostButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="px-6">
        <div className="flex items-center justify-between">
          <h3 className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-ink-3">
            Stages
          </h3>
          <PrimaryButton onClick={addStage} disabled={config.phases.length === 0}>
            + Add stage
          </PrimaryButton>
        </div>
        {orderedStages.length === 0 ? (
          <p className="mt-3 text-[0.84rem] text-ink-3">
            No stages. Stages determine the execution order of phases in a cycle.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-[8px] border border-stroke-1">
            <table className="w-full text-left text-[0.82rem]">
              <thead className="bg-surface-2 text-[0.62rem] uppercase tracking-[0.2em] text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-semibold">Order</th>
                  <th className="px-3 py-2 font-semibold">Stage</th>
                  <th className="px-3 py-2 font-semibold">Phase</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-0">
                {orderedStages.map((stage) => (
                  <tr key={stage.id} className="bg-surface-1 align-top">
                    <td className="px-3 py-2 font-mono text-info-ink">{stage.order}</td>
                    <td className="px-3 py-2">
                      <StudioInput
                        value={stage.label}
                        onChange={(value) =>
                          dispatch({
                            type: "updateStage",
                            intersectionId: config.id,
                            stageId: stage.id,
                            patch: { label: value },
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={stage.phaseId}
                        onChange={(event) =>
                          dispatch({
                            type: "updateStage",
                            intersectionId: config.id,
                            stageId: stage.id,
                            patch: { phaseId: event.target.value },
                          })
                        }
                        className="rounded-[5px] border border-stroke-1 bg-surface-2 px-2.5 py-1.5 text-[0.84rem] text-ink-1 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent-stroke"
                      >
                        {config.phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <GhostButton
                          onClick={() =>
                            dispatch({
                              type: "moveStage",
                              intersectionId: config.id,
                              stageId: stage.id,
                              direction: "up",
                            })
                          }
                        >
                          ↑
                        </GhostButton>
                        <GhostButton
                          onClick={() =>
                            dispatch({
                              type: "moveStage",
                              intersectionId: config.id,
                              stageId: stage.id,
                              direction: "down",
                            })
                          }
                        >
                          ↓
                        </GhostButton>
                        <GhostButton
                          tone="danger"
                          onClick={() =>
                            dispatch({
                              type: "deleteStage",
                              intersectionId: config.id,
                              stageId: stage.id,
                            })
                          }
                        >
                          Delete
                        </GhostButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {phaseLookup.size === 0 ? null : (
          <p className="mt-2 text-[0.72rem] text-ink-3">
            Cycle runs stages in order {orderedStages.map((s) => s.order).join(" → ")}.
          </p>
        )}
      </section>

      <section className="px-6">
        <h3 className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-ink-3">
          Conflict matrix
        </h3>
        <p className="mt-1 text-[0.78rem] text-ink-2">
          Click a cell to toggle whether the two signal groups may go green
          simultaneously. Violations listed above are phases that break these
          rules.
        </p>
        {config.signalGroups.length === 0 ? (
          <p className="mt-3 text-[0.84rem] text-ink-3">
            Define at least two signal groups before building the conflict matrix.
          </p>
        ) : (
          <div className="mt-3 overflow-auto rounded-[8px] border border-stroke-1">
            <table className="min-w-full text-left text-[0.74rem]">
              <thead className="bg-surface-2 text-[0.6rem] uppercase tracking-[0.2em] text-ink-3">
                <tr>
                  <th className="px-2 py-2 font-semibold"></th>
                  {config.signalGroups.map((group) => (
                    <th key={group.id} className="px-2 py-2 text-center font-mono text-sig-yellow-ink">
                      {group.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {config.signalGroups.map((row) => (
                  <tr key={row.id} className="bg-surface-1">
                    <th className="px-2 py-1 text-left font-mono text-sig-yellow-ink">
                      {row.id}
                    </th>
                    {config.signalGroups.map((col) => {
                      if (row.id === col.id) {
                        return (
                          <td
                            key={col.id}
                            className="px-2 py-1 text-center text-ink-3"
                          >
                            —
                          </td>
                        );
                      }
                      const conflict = hasConflict(config.conflicts, row.id, col.id);
                      return (
                        <td key={col.id} className="p-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              dispatch({
                                type: "toggleConflict",
                                intersectionId: config.id,
                                pair: { a: row.id, b: col.id },
                              })
                            }
                            className={clsx(
                              "mx-auto block h-6 w-full rounded-[3px] border text-[0.68rem] font-semibold transition",
                              conflict
                                ? "border-danger-stroke bg-danger-surface text-danger-ink"
                                : "border-stroke-1 bg-surface-2 text-ink-3 hover:border-stroke-2 hover:text-ink-1",
                            )}
                          >
                            {conflict ? "✕" : "·"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
