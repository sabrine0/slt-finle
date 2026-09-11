"use client";

import clsx from "clsx";
import { useState } from "react";

import {
  GhostButton,
  PrimaryButton,
  SectionToolbar,
  StudioInput,
  StudioSelect,
} from "@/components/studio/intersection-editor/form-controls";
import { useStudioDispatch } from "@/components/studio/state/store";
import type {
  IntersectionConfig,
  OperatingMode,
  OperatingModeKind,
} from "@/components/studio/state/types";

const KIND_OPTIONS: Array<{ value: OperatingModeKind; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "peak", label: "Peak" },
  { value: "tram-priority", label: "Tram priority" },
  { value: "bus-priority", label: "Bus priority" },
  { value: "night", label: "Night" },
  { value: "flash", label: "Flashing" },
  { value: "emergency", label: "Emergency" },
  { value: "degraded", label: "Degraded / fallback" },
];

const KIND_TONE: Record<
  OperatingModeKind,
  { border: string; bg: string; fg: string }
> = {
  normal: {
    border: "border-sig-green-stroke",
    bg: "bg-sig-green-surface",
    fg: "text-sig-green-ink",
  },
  peak: {
    border: "border-accent-stroke",
    bg: "bg-accent-surface",
    fg: "text-accent-ink",
  },
  "tram-priority": {
    border: "border-[#4a9bff]/60",
    bg: "bg-[#0f1e3a]",
    fg: "text-[#8ec0ff]",
  },
  "bus-priority": {
    border: "border-[#ff9a4a]/60",
    bg: "bg-[#2a1908]",
    fg: "text-[#ffb87a]",
  },
  night: {
    border: "border-stroke-2",
    bg: "bg-surface-3",
    fg: "text-ink-1",
  },
  flash: {
    border: "border-sig-yellow-stroke",
    bg: "bg-sig-yellow-surface",
    fg: "text-sig-yellow-ink",
  },
  emergency: {
    border: "border-danger-stroke",
    bg: "bg-danger-surface",
    fg: "text-danger-ink",
  },
  degraded: {
    border: "border-danger-stroke",
    bg: "bg-danger-surface",
    fg: "text-danger-ink",
  },
};

export function ModesSection({ config }: { config: IntersectionConfig }) {
  const dispatch = useStudioDispatch();
  const [editingId, setEditingId] = useState<string | null>(null);

  const modes = config.modes ?? [];

  const addMode = () => {
    const nextIndex = modes.length + 1;
    const id = `mode-${nextIndex.toString().padStart(2, "0")}`;
    const mode: OperatingMode = {
      id,
      label: `Mode ${nextIndex}`,
      kind: "normal",
      enabledPhaseIds: config.phases.map((p) => p.id),
      priorityRules: {},
    };
    dispatch({ type: "addMode", intersectionId: config.id, mode });
    setEditingId(id);
  };

  const togglePhase = (mode: OperatingMode, phaseId: string) => {
    const has = mode.enabledPhaseIds.includes(phaseId);
    dispatch({
      type: "updateMode",
      intersectionId: config.id,
      modeId: mode.id,
      patch: {
        enabledPhaseIds: has
          ? mode.enabledPhaseIds.filter((id) => id !== phaseId)
          : [...mode.enabledPhaseIds, phaseId],
      },
    });
  };

  const updatePriority = (
    mode: OperatingMode,
    key: keyof NonNullable<OperatingMode["priorityRules"]>,
    value: boolean,
  ) => {
    dispatch({
      type: "updateMode",
      intersectionId: config.id,
      modeId: mode.id,
      patch: {
        priorityRules: {
          ...(mode.priorityRules ?? {}),
          [key]: value,
        },
      },
    });
  };

  return (
    <section className="flex flex-col">
      <SectionToolbar
        title="Operating modes"
        subtitle="Time-of-day and incident profiles. Each mode can enable a subset of phases, override cycle length, and toggle priority handling for tram / bus / emergency vehicles."
        right={<PrimaryButton onClick={addMode}>+ Add mode</PrimaryButton>}
      />

      <div className="px-6 py-5">
        {modes.length === 0 ? (
          <p className="text-[0.84rem] text-ink-3">
            No operating modes defined. The intersection runs with all phases
            permanently enabled. Add a mode to create a peak / night /
            priority profile.
          </p>
        ) : (
          <div className="space-y-3">
            {modes.map((mode) => {
              const editing = editingId === mode.id;
              const tone = KIND_TONE[mode.kind];
              const rules = mode.priorityRules ?? {};
              return (
                <div
                  key={mode.id}
                  className="overflow-hidden rounded-[8px] border border-stroke-1 bg-surface-1"
                >
                  <header className="flex items-center gap-3 border-b border-stroke-0 bg-surface-2 px-3 py-2">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em]",
                        tone.border,
                        tone.bg,
                        tone.fg,
                      )}
                    >
                      {mode.kind}
                    </span>
                    <span className="font-mono text-[0.72rem] text-sig-yellow-ink">
                      {mode.id}
                    </span>
                    {editing ? (
                      <StudioInput
                        value={mode.label}
                        onChange={(value) =>
                          dispatch({
                            type: "updateMode",
                            intersectionId: config.id,
                            modeId: mode.id,
                            patch: { label: value },
                          })
                        }
                        className="flex-1"
                      />
                    ) : (
                      <span className="flex-1 text-[0.82rem] font-semibold text-ink-0">
                        {mode.label}
                      </span>
                    )}
                    <GhostButton
                      onClick={() => setEditingId(editing ? null : mode.id)}
                    >
                      {editing ? "Done" : "Edit"}
                    </GhostButton>
                    <GhostButton
                      tone="danger"
                      onClick={() =>
                        dispatch({
                          type: "deleteMode",
                          intersectionId: config.id,
                          modeId: mode.id,
                        })
                      }
                    >
                      Delete
                    </GhostButton>
                  </header>

                  <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4 px-3 py-3">
                    <div>
                      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                        Enabled phases
                      </p>
                      <p className="mt-0.5 text-[0.7rem] text-ink-2">
                        Phases not in this list are skipped from the cycle
                        while this mode is active.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {config.phases.length === 0 ? (
                          <span className="text-[0.7rem] text-ink-3">
                            No phases defined.
                          </span>
                        ) : (
                          config.phases.map((phase) => {
                            const on = mode.enabledPhaseIds.includes(phase.id);
                            return (
                              <button
                                key={phase.id}
                                type="button"
                                onClick={() => togglePhase(mode, phase.id)}
                                className={clsx(
                                  "rounded-[4px] border px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.04em] transition",
                                  on
                                    ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
                                    : "border-stroke-1 bg-surface-2 text-ink-3 hover:border-stroke-2 hover:text-ink-1",
                                )}
                              >
                                {phase.id}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div>
                        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                          Mode kind
                        </p>
                        <div className="mt-1">
                          <StudioSelect
                            value={mode.kind}
                            onChange={(value) =>
                              dispatch({
                                type: "updateMode",
                                intersectionId: config.id,
                                modeId: mode.id,
                                patch: {
                                  kind: (value || "normal") as OperatingModeKind,
                                },
                              })
                            }
                            options={KIND_OPTIONS}
                          />
                        </div>
                      </div>

                      <div>
                        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                          Cycle override
                        </p>
                        <div className="mt-1">
                          <StudioInput
                            type="number"
                            value={mode.cycleSecondsOverride ?? ""}
                            placeholder="— inherit"
                            onChange={(value) => {
                              const parsed = value.trim() === "" ? undefined : Number(value);
                              dispatch({
                                type: "updateMode",
                                intersectionId: config.id,
                                modeId: mode.id,
                                patch: {
                                  cycleSecondsOverride:
                                    parsed !== undefined && Number.isFinite(parsed)
                                      ? Math.max(10, Math.min(240, parsed))
                                      : undefined,
                                },
                              });
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
                          Priority rules
                        </p>
                        <div className="mt-1 flex flex-col gap-0.5 text-[0.72rem]">
                          <label className="inline-flex items-center gap-1.5 text-ink-1">
                            <input
                              type="checkbox"
                              checked={!!rules.tramOnRequest}
                              onChange={(e) =>
                                updatePriority(mode, "tramOnRequest", e.target.checked)
                              }
                            />
                            Serve tram on request
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-ink-1">
                            <input
                              type="checkbox"
                              checked={!!rules.busOnRequest}
                              onChange={(e) =>
                                updatePriority(mode, "busOnRequest", e.target.checked)
                              }
                            />
                            Serve bus on request
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-ink-1">
                            <input
                              type="checkbox"
                              checked={!!rules.emergencyPreemption}
                              onChange={(e) =>
                                updatePriority(mode, "emergencyPreemption", e.target.checked)
                              }
                            />
                            Emergency preemption
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
