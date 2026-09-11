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
  Movement,
  SignalGroupKind,
  Turning,
} from "@/components/studio/state/types";

const KIND_OPTIONS: Array<{ value: SignalGroupKind; label: string }> = [
  { value: "vehicle", label: "Vehicle" },
  { value: "tram", label: "Tram" },
  { value: "busway", label: "Busway" },
  { value: "pedestrian", label: "Pedestrian" },
  { value: "emergency", label: "Emergency" },
];

const TURNING_OPTIONS: Array<{ value: Turning; label: string }> = [
  { value: "through", label: "Through" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "u-turn", label: "U-turn" },
];

const KIND_BADGE: Record<
  SignalGroupKind,
  { border: string; bg: string; fg: string }
> = {
  vehicle: {
    border: "border-sig-green-stroke",
    bg: "bg-sig-green-surface",
    fg: "text-sig-green-ink",
  },
  tram: {
    border: "border-[#4a9bff]/60",
    bg: "bg-[#0f1e3a]",
    fg: "text-[#8ec0ff]",
  },
  busway: {
    border: "border-[#ff9a4a]/60",
    bg: "bg-[#2a1908]",
    fg: "text-[#ffb87a]",
  },
  pedestrian: {
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

export function MovementsSection({ config }: { config: IntersectionConfig }) {
  const dispatch = useStudioDispatch();
  const [editingId, setEditingId] = useState<string | null>(null);

  const movements = config.movements ?? [];

  const approachOptions = [
    { value: "" as const, label: "—" },
    ...config.approaches.map((approach) => ({
      value: approach.id,
      label: `${approach.bearing} — ${approach.label}`,
    })),
  ];

  const sgOptions = config.signalGroups.map((sg) => ({
    value: sg.id,
    label: `${sg.id} · ${sg.label}`,
    kind: sg.kind ?? "vehicle",
  }));

  const addMovement = () => {
    const nextIndex = movements.length + 1;
    const id = `mv-${nextIndex.toString().padStart(2, "0")}`;
    const movement: Movement = {
      id,
      label: `Movement ${nextIndex}`,
      kind: "vehicle",
      signalGroupIds: [],
      enabled: true,
      priority: false,
    };
    dispatch({
      type: "addMovement",
      intersectionId: config.id,
      movement,
    });
    setEditingId(id);
  };

  const toggleSgLink = (movement: Movement, sgId: string) => {
    const has = movement.signalGroupIds.includes(sgId);
    dispatch({
      type: "updateMovement",
      intersectionId: config.id,
      movementId: movement.id,
      patch: {
        signalGroupIds: has
          ? movement.signalGroupIds.filter((id) => id !== sgId)
          : [...movement.signalGroupIds, sgId],
      },
    });
  };

  return (
    <section className="flex flex-col">
      <SectionToolbar
        title="Movements"
        subtitle="Semantic paths through the intersection — each movement is driven by one or more signal groups. Trams, busways, pedestrians and emergency movements are all first-class here."
        right={<PrimaryButton onClick={addMovement}>+ Add movement</PrimaryButton>}
      />

      <div className="px-6 py-5">
        {movements.length === 0 ? (
          <p className="text-[0.84rem] text-ink-3">
            No movements declared. Add a movement to map an approach pair to its
            controlling signal group(s).
          </p>
        ) : (
          <div className="overflow-hidden rounded-[8px] border border-stroke-1">
            <table className="w-full text-left text-[0.8rem]">
              <thead className="bg-surface-2 text-[0.62rem] uppercase tracking-[0.2em] text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">Label</th>
                  <th className="px-3 py-2 font-semibold">Kind</th>
                  <th className="px-3 py-2 font-semibold">From</th>
                  <th className="px-3 py-2 font-semibold">To</th>
                  <th className="px-3 py-2 font-semibold">Turning</th>
                  <th className="px-3 py-2 font-semibold">Signal groups</th>
                  <th className="px-3 py-2 font-semibold">Flags</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-0">
                {movements.map((movement) => {
                  const editing = editingId === movement.id;
                  const enabled = movement.enabled ?? true;
                  const priority = movement.priority ?? false;
                  return (
                    <tr
                      key={movement.id}
                      className={clsx(
                        "bg-surface-1 align-top",
                        !enabled && "opacity-60",
                      )}
                    >
                      <td className="px-3 py-2 font-mono text-sig-yellow-ink">
                        {movement.id}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioInput
                            value={movement.label}
                            onChange={(value) =>
                              dispatch({
                                type: "updateMovement",
                                intersectionId: config.id,
                                movementId: movement.id,
                                patch: { label: value },
                              })
                            }
                          />
                        ) : (
                          <span className="text-ink-1">{movement.label}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioSelect
                            value={movement.kind}
                            onChange={(value) =>
                              dispatch({
                                type: "updateMovement",
                                intersectionId: config.id,
                                movementId: movement.id,
                                patch: {
                                  kind: (value || "vehicle") as SignalGroupKind,
                                },
                              })
                            }
                            options={KIND_OPTIONS}
                          />
                        ) : (
                          <KindChip kind={movement.kind} />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <StudioSelect
                          value={movement.fromApproachId ?? ""}
                          onChange={(value) =>
                            dispatch({
                              type: "updateMovement",
                              intersectionId: config.id,
                              movementId: movement.id,
                              patch: { fromApproachId: value || undefined },
                            })
                          }
                          options={approachOptions.map((opt) => ({
                            value: opt.value as string,
                            label: opt.label,
                          }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <StudioSelect
                          value={movement.toApproachId ?? ""}
                          onChange={(value) =>
                            dispatch({
                              type: "updateMovement",
                              intersectionId: config.id,
                              movementId: movement.id,
                              patch: { toApproachId: value || undefined },
                            })
                          }
                          options={approachOptions.map((opt) => ({
                            value: opt.value as string,
                            label: opt.label,
                          }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <StudioSelect
                          value={movement.turning ?? ""}
                          onChange={(value) =>
                            dispatch({
                              type: "updateMovement",
                              intersectionId: config.id,
                              movementId: movement.id,
                              patch: {
                                turning: (value || undefined) as Turning | undefined,
                              },
                            })
                          }
                          options={TURNING_OPTIONS}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {sgOptions.length === 0 ? (
                            <span className="text-[0.7rem] text-ink-3">
                              No signal groups
                            </span>
                          ) : (
                            sgOptions.map((opt) => {
                              const linked = movement.signalGroupIds.includes(
                                opt.value,
                              );
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    toggleSgLink(movement, opt.value)
                                  }
                                  className={clsx(
                                    "rounded-[4px] border px-1.5 py-0.5 text-[0.62rem] font-semibold tracking-[0.04em] transition",
                                    linked
                                      ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
                                      : "border-stroke-1 bg-surface-2 text-ink-3 hover:border-stroke-2 hover:text-ink-1",
                                  )}
                                >
                                  {opt.value}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1 text-[0.64rem]">
                          <label className="inline-flex items-center gap-1.5 text-ink-2">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) =>
                                dispatch({
                                  type: "updateMovement",
                                  intersectionId: config.id,
                                  movementId: movement.id,
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
                                  type: "updateMovement",
                                  intersectionId: config.id,
                                  movementId: movement.id,
                                  patch: { priority: event.target.checked },
                                })
                              }
                            />
                            Priority
                          </label>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <GhostButton
                            onClick={() =>
                              setEditingId(editing ? null : movement.id)
                            }
                          >
                            {editing ? "Done" : "Edit"}
                          </GhostButton>
                          <GhostButton
                            tone="danger"
                            onClick={() =>
                              dispatch({
                                type: "deleteMovement",
                                intersectionId: config.id,
                                movementId: movement.id,
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
      </div>
    </section>
  );
}

function KindChip({ kind }: { kind: SignalGroupKind }) {
  const tone = KIND_BADGE[kind];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em]",
        tone.border,
        tone.bg,
        tone.fg,
      )}
    >
      {kind}
    </span>
  );
}
