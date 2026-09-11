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
import {
  defaultAllowedTurnings,
  type IntersectionConfig,
  type Lane,
  type LaneType,
  type Turning,
} from "@/components/studio/state/types";

const TYPE_OPTIONS: Array<{ value: LaneType; label: string }> = [
  { value: "general", label: "General" },
  { value: "through", label: "Through" },
  { value: "left-turn", label: "Left turn" },
  { value: "right-turn", label: "Right turn" },
  { value: "shared-left-through", label: "Shared L+T" },
  { value: "shared-through-right", label: "Shared T+R" },
  { value: "tram", label: "Tram" },
  { value: "busway", label: "Busway" },
  { value: "taxi", label: "Taxi" },
  { value: "bike", label: "Bike" },
  { value: "pedestrian-crossing", label: "Pedestrian crossing" },
  { value: "emergency", label: "Emergency" },
];

const TURNING_OPTIONS: Array<{ value: Turning; label: string }> = [
  { value: "through", label: "Through" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "u-turn", label: "U-turn" },
];

// Colours used both here and in the diagram — keep them aligned.
export const LANE_TYPE_TONE: Record<
  LaneType,
  { border: string; bg: string; fg: string }
> = {
  general: {
    border: "border-stroke-1",
    bg: "bg-surface-2",
    fg: "text-ink-1",
  },
  through: {
    border: "border-sig-green-stroke",
    bg: "bg-sig-green-surface",
    fg: "text-sig-green-ink",
  },
  "left-turn": {
    border: "border-[#4a9bff]/60",
    bg: "bg-[#0f1e3a]",
    fg: "text-[#8ec0ff]",
  },
  "right-turn": {
    border: "border-[#4a9bff]/60",
    bg: "bg-[#0f1e3a]",
    fg: "text-[#8ec0ff]",
  },
  "shared-left-through": {
    border: "border-stroke-2",
    bg: "bg-surface-3",
    fg: "text-ink-1",
  },
  "shared-through-right": {
    border: "border-stroke-2",
    bg: "bg-surface-3",
    fg: "text-ink-1",
  },
  tram: {
    border: "border-[#c04a72]/60",
    bg: "bg-[#2a0f18]",
    fg: "text-[#ff9ab8]",
  },
  busway: {
    border: "border-[#ff9a4a]/60",
    bg: "bg-[#2a1908]",
    fg: "text-[#ffb87a]",
  },
  taxi: {
    border: "border-sig-yellow-stroke",
    bg: "bg-sig-yellow-surface",
    fg: "text-sig-yellow-ink",
  },
  bike: {
    border: "border-[#6ad68f]/60",
    bg: "bg-[#0d1e14]",
    fg: "text-[#9af0b3]",
  },
  "pedestrian-crossing": {
    border: "border-accent-stroke",
    bg: "bg-accent-surface",
    fg: "text-accent-ink",
  },
  emergency: {
    border: "border-danger-stroke",
    bg: "bg-danger-surface",
    fg: "text-danger-ink",
  },
};

export function LanesSection({ config }: { config: IntersectionConfig }) {
  const dispatch = useStudioDispatch();
  const [editingId, setEditingId] = useState<string | null>(null);
  const lanes = config.lanes ?? [];

  const approachOptions = config.approaches.map((approach) => ({
    value: approach.id,
    label: `${approach.bearing} — ${approach.label}`,
  }));

  const addLane = () => {
    if (config.approaches.length === 0) return;
    const approach = config.approaches[0];
    const count = lanes.filter((l) => l.approachId === approach.id).length;
    const id = `lane-${approach.bearing.toLowerCase()}-${count + 1}`;
    const lane: Lane = {
      id,
      label: `${approach.bearing} lane ${count + 1}`,
      approachId: approach.id,
      type: "through",
      allowedTurnings: defaultAllowedTurnings("through"),
      signalGroupIds: [],
      detectorIds: [],
      enabled: true,
      priority: false,
    };
    dispatch({ type: "addLane", intersectionId: config.id, lane });
    setEditingId(id);
  };

  const toggleTurning = (lane: Lane, turning: Turning) => {
    const current = lane.allowedTurnings ?? defaultAllowedTurnings(lane.type);
    const has = current.includes(turning);
    const next = has
      ? current.filter((t) => t !== turning)
      : [...current, turning];
    dispatch({
      type: "updateLane",
      intersectionId: config.id,
      laneId: lane.id,
      patch: { allowedTurnings: next },
    });
  };

  const toggleSgLink = (lane: Lane, sgId: string) => {
    const current = lane.signalGroupIds ?? [];
    const has = current.includes(sgId);
    const next = has
      ? current.filter((id) => id !== sgId)
      : [...current, sgId];
    dispatch({
      type: "updateLane",
      intersectionId: config.id,
      laneId: lane.id,
      patch: { signalGroupIds: next },
    });
  };

  const toggleDetectorLink = (lane: Lane, detectorId: string) => {
    const current = lane.detectorIds ?? [];
    const has = current.includes(detectorId);
    const next = has
      ? current.filter((id) => id !== detectorId)
      : [...current, detectorId];
    dispatch({
      type: "updateLane",
      intersectionId: config.id,
      laneId: lane.id,
      patch: { detectorIds: next },
    });
  };

  const lanesByApproach = new Map<string, Lane[]>();
  for (const lane of lanes) {
    const list = lanesByApproach.get(lane.approachId) ?? [];
    list.push(lane);
    lanesByApproach.set(lane.approachId, list);
  }

  return (
    <section className="flex flex-col">
      <SectionToolbar
        title="Lanes"
        subtitle="Real lane-level model per approach. Each lane carries a type, allowed turnings, and optional links to signal groups and detectors. Leave empty to keep the approach-level view."
        right={
          <PrimaryButton
            onClick={addLane}
            disabled={config.approaches.length === 0}
          >
            + Add lane
          </PrimaryButton>
        }
      />

      <div className="px-6 py-5">
        {lanes.length === 0 ? (
          <p className="text-[0.84rem] text-ink-3">
            No lanes declared. The diagram renders the approach-level fallback
            (evenly-divided road rectangle). Add a lane to enable lane-specific
            rendering, signal-group linking and conflict detection.
          </p>
        ) : (
          <div className="space-y-3">
            {config.approaches.map((approach) => {
              const list = lanesByApproach.get(approach.id) ?? [];
              if (list.length === 0) return null;
              return (
                <div
                  key={approach.id}
                  className="overflow-hidden rounded-[8px] border border-stroke-1 bg-surface-1"
                >
                  <header className="flex items-center justify-between gap-2 border-b border-stroke-0 bg-surface-2 px-3 py-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[0.72rem] text-sig-yellow-ink">
                        {approach.bearing}
                      </span>
                      <span className="text-[0.82rem] font-semibold text-ink-0">
                        {approach.label}
                      </span>
                      <span className="text-[0.66rem] text-ink-3">
                        · {list.length} lane{list.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </header>

                  <table className="w-full text-left text-[0.78rem]">
                    <thead className="text-[0.6rem] uppercase tracking-[0.2em] text-ink-3">
                      <tr>
                        <th className="px-3 py-1.5 font-semibold">ID</th>
                        <th className="px-3 py-1.5 font-semibold">Label</th>
                        <th className="px-3 py-1.5 font-semibold">Type</th>
                        <th className="px-3 py-1.5 font-semibold">Turnings</th>
                        <th className="px-3 py-1.5 font-semibold">Signal groups</th>
                        <th className="px-3 py-1.5 font-semibold">Detectors</th>
                        <th className="px-3 py-1.5 font-semibold">Flags</th>
                        <th className="px-3 py-1.5 text-right font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke-0">
                      {list.map((lane) => {
                        const editing = editingId === lane.id;
                        const enabled = lane.enabled ?? true;
                        const priority = lane.priority ?? false;
                        const allowed =
                          lane.allowedTurnings ??
                          defaultAllowedTurnings(lane.type);
                        return (
                          <tr
                            key={lane.id}
                            className={clsx(
                              "align-top",
                              !enabled && "opacity-60",
                            )}
                          >
                            <td className="px-3 py-1.5 font-mono text-[0.72rem] text-info-ink">
                              {lane.id}
                            </td>
                            <td className="px-3 py-1.5">
                              {editing ? (
                                <StudioInput
                                  value={lane.label}
                                  onChange={(value) =>
                                    dispatch({
                                      type: "updateLane",
                                      intersectionId: config.id,
                                      laneId: lane.id,
                                      patch: { label: value },
                                    })
                                  }
                                />
                              ) : (
                                <span className="text-ink-1">{lane.label}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              {editing ? (
                                <StudioSelect
                                  value={lane.type}
                                  onChange={(value) =>
                                    dispatch({
                                      type: "updateLane",
                                      intersectionId: config.id,
                                      laneId: lane.id,
                                      patch: {
                                        type: (value || "general") as LaneType,
                                        allowedTurnings:
                                          defaultAllowedTurnings(
                                            (value || "general") as LaneType,
                                          ),
                                      },
                                    })
                                  }
                                  options={TYPE_OPTIONS}
                                />
                              ) : (
                                <LaneTypeBadge type={lane.type} />
                              )}
                              {editing ? (
                                <div className="mt-1">
                                  <StudioSelect
                                    value={lane.approachId}
                                    onChange={(value) =>
                                      dispatch({
                                        type: "updateLane",
                                        intersectionId: config.id,
                                        laneId: lane.id,
                                        patch: {
                                          approachId: value || approach.id,
                                        },
                                      })
                                    }
                                    options={approachOptions}
                                  />
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-wrap gap-1">
                                {TURNING_OPTIONS.map((opt) => {
                                  const on = allowed.includes(opt.value);
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => toggleTurning(lane, opt.value)}
                                      className={clsx(
                                        "rounded-[3px] border px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] transition",
                                        on
                                          ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
                                          : "border-stroke-1 bg-surface-2 text-ink-3 hover:border-stroke-2 hover:text-ink-1",
                                      )}
                                    >
                                      {opt.value === "u-turn" ? "U" : opt.value[0]}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-wrap gap-1">
                                {config.signalGroups.length === 0 ? (
                                  <span className="text-[0.66rem] text-ink-3">
                                    —
                                  </span>
                                ) : (
                                  config.signalGroups.map((sg) => {
                                    const linked = (
                                      lane.signalGroupIds ?? []
                                    ).includes(sg.id);
                                    return (
                                      <button
                                        key={sg.id}
                                        type="button"
                                        onClick={() => toggleSgLink(lane, sg.id)}
                                        title={sg.label}
                                        className={clsx(
                                          "rounded-[3px] border px-1.5 py-0.5 text-[0.58rem] font-mono font-semibold transition",
                                          linked
                                            ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
                                            : "border-stroke-1 bg-surface-2 text-ink-3 hover:border-stroke-2 hover:text-ink-1",
                                        )}
                                      >
                                        {sg.id}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-wrap gap-1">
                                {config.detectors.length === 0 ? (
                                  <span className="text-[0.66rem] text-ink-3">
                                    —
                                  </span>
                                ) : (
                                  config.detectors.map((det) => {
                                    const linked = (
                                      lane.detectorIds ?? []
                                    ).includes(det.id);
                                    return (
                                      <button
                                        key={det.id}
                                        type="button"
                                        onClick={() =>
                                          toggleDetectorLink(lane, det.id)
                                        }
                                        title={det.label}
                                        className={clsx(
                                          "rounded-[3px] border px-1.5 py-0.5 text-[0.58rem] font-mono font-semibold transition",
                                          linked
                                            ? "border-info-ink/60 bg-[#0e1e24] text-info-ink"
                                            : "border-stroke-1 bg-surface-2 text-ink-3 hover:border-stroke-2 hover:text-ink-1",
                                        )}
                                      >
                                        {det.id}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-col gap-0.5 text-[0.64rem]">
                                <label className="inline-flex items-center gap-1.5 text-ink-2">
                                  <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(event) =>
                                      dispatch({
                                        type: "updateLane",
                                        intersectionId: config.id,
                                        laneId: lane.id,
                                        patch: { enabled: event.target.checked },
                                      })
                                    }
                                  />
                                  Enabled
                                </label>
                                <label className="inline-flex items-center gap-1.5 text-ink-2">
                                  <input
                                    type="checkbox"
                                    checked={priority}
                                    onChange={(event) =>
                                      dispatch({
                                        type: "updateLane",
                                        intersectionId: config.id,
                                        laneId: lane.id,
                                        patch: {
                                          priority: event.target.checked,
                                        },
                                      })
                                    }
                                  />
                                  Priority
                                </label>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <GhostButton
                                  onClick={() =>
                                    setEditingId(editing ? null : lane.id)
                                  }
                                >
                                  {editing ? "Done" : "Edit"}
                                </GhostButton>
                                <GhostButton
                                  tone="danger"
                                  onClick={() =>
                                    dispatch({
                                      type: "deleteLane",
                                      intersectionId: config.id,
                                      laneId: lane.id,
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
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function LaneTypeBadge({ type }: { type: LaneType }) {
  const tone = LANE_TYPE_TONE[type];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em]",
        tone.border,
        tone.bg,
        tone.fg,
      )}
    >
      {type.replace(/-/g, " ")}
    </span>
  );
}
