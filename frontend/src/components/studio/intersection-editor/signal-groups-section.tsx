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
  SignalAspect,
  SignalGroup,
  SignalGroupKind,
} from "@/components/studio/state/types";

const KIND_OPTIONS: Array<{ value: SignalGroupKind; label: string }> = [
  { value: "vehicle", label: "Vehicle" },
  { value: "tram", label: "Tram" },
  { value: "busway", label: "Busway" },
  { value: "pedestrian", label: "Pedestrian" },
  { value: "emergency", label: "Emergency" },
];

const KIND_LABEL: Record<SignalGroupKind, string> = {
  vehicle: "Vehicle",
  tram: "Tram",
  busway: "Busway",
  pedestrian: "Pedestrian",
  emergency: "Emergency",
};

const KIND_TONE: Record<
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

const ASPECT_OPTIONS: SignalAspect[] = [
  "red",
  "yellow",
  "green",
  "arrow-left",
  "arrow-right",
  "arrow-straight",
  "ped-walk",
  "ped-stop",
];

const ASPECT_LABEL: Record<SignalAspect, string> = {
  red: "R",
  yellow: "Y",
  green: "G",
  "arrow-left": "◀",
  "arrow-right": "▶",
  "arrow-straight": "▲",
  "ped-walk": "P●",
  "ped-stop": "P○",
};

const ASPECT_COLOR: Record<SignalAspect, string> = {
  red: "var(--stls-sig-red)",
  yellow: "var(--stls-sig-yellow-ink)",
  green: "var(--stls-sig-green)",
  "arrow-left": "var(--stls-info-ink)",
  "arrow-right": "var(--stls-info-ink)",
  "arrow-straight": "var(--stls-info-ink)",
  "ped-walk": "var(--stls-sig-green-ink)",
  "ped-stop": "var(--stls-sig-red-ink)",
};

export function SignalGroupsSection({ config }: { config: IntersectionConfig }) {
  const dispatch = useStudioDispatch();
  const [editingId, setEditingId] = useState<string | null>(null);

  const approachOptions = config.approaches.map((approach) => ({
    value: approach.id,
    label: `${approach.bearing} — ${approach.label}`,
  }));

  const addSignalGroup = () => {
    const id = `sg-new-${Date.now().toString(36).slice(-4)}`;
    const next: SignalGroup = {
      id,
      label: "New signal group",
      approachId: config.approaches[0]?.id,
      aspects: ["red", "yellow", "green"],
    };
    dispatch({ type: "addSignalGroup", intersectionId: config.id, signalGroup: next });
    setEditingId(id);
  };

  const toggleAspect = (group: SignalGroup, aspect: SignalAspect) => {
    const has = group.aspects.includes(aspect);
    dispatch({
      type: "updateSignalGroup",
      intersectionId: config.id,
      signalGroupId: group.id,
      patch: {
        aspects: has
          ? group.aspects.filter((value) => value !== aspect)
          : [...group.aspects, aspect],
      },
    });
  };

  return (
    <section className="flex flex-col">
      <SectionToolbar
        title="Signal groups"
        subtitle="A signal group drives one logical movement (heads + aspects). Bind each group to an approach so phases can reference them by direction."
        right={<PrimaryButton onClick={addSignalGroup}>+ Add signal group</PrimaryButton>}
      />

      <div className="px-6 py-5">
        {config.signalGroups.length === 0 ? (
          <p className="text-[0.84rem] text-ink-3">
            No signal groups yet. Create one and link it to an approach.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[8px] border border-stroke-1">
            <table className="w-full text-left text-[0.82rem]">
              <thead className="bg-surface-2 text-[0.62rem] uppercase tracking-[0.2em] text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">Label</th>
                  <th className="px-3 py-2 font-semibold">Kind</th>
                  <th className="px-3 py-2 font-semibold">Approach</th>
                  <th className="px-3 py-2 font-semibold">Aspects</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-0">
                {config.signalGroups.map((group) => {
                  const editing = editingId === group.id;
                  return (
                    <tr key={group.id} className="bg-surface-1 align-top">
                      <td className="px-3 py-2 font-mono text-sig-yellow-ink">{group.id}</td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioInput
                            value={group.label}
                            onChange={(value) =>
                              dispatch({
                                type: "updateSignalGroup",
                                intersectionId: config.id,
                                signalGroupId: group.id,
                                patch: { label: value },
                              })
                            }
                          />
                        ) : (
                          <span className="text-ink-1">{group.label}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioSelect
                            value={(group.kind ?? "vehicle") as SignalGroupKind}
                            onChange={(value) =>
                              dispatch({
                                type: "updateSignalGroup",
                                intersectionId: config.id,
                                signalGroupId: group.id,
                                patch: {
                                  kind: (value || "vehicle") as SignalGroupKind,
                                },
                              })
                            }
                            options={KIND_OPTIONS}
                          />
                        ) : (
                          <KindBadge kind={group.kind ?? "vehicle"} />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioSelect
                            value={group.approachId ?? ""}
                            onChange={(value) =>
                              dispatch({
                                type: "updateSignalGroup",
                                intersectionId: config.id,
                                signalGroupId: group.id,
                                patch: { approachId: value || undefined },
                              })
                            }
                            options={approachOptions}
                          />
                        ) : (
                          <span className="text-[0.78rem] text-ink-1">
                            {group.approachId
                              ? config.approaches.find((appr) => appr.id === group.approachId)
                                  ?.label ?? group.approachId
                              : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {ASPECT_OPTIONS.map((aspect) => {
                            const enabled = group.aspects.includes(aspect);
                            return (
                              <button
                                key={aspect}
                                type="button"
                                onClick={() => toggleAspect(group, aspect)}
                                className={clsx(
                                  "rounded-[4px] border px-2 py-0.5 text-[0.66rem] font-semibold tracking-[0.04em] transition",
                                  enabled
                                    ? "border-stroke-1"
                                    : "border-stroke-1 bg-surface-2 text-ink-3 hover:border-stroke-2",
                                )}
                                style={
                                  enabled
                                    ? {
                                        backgroundColor: `color-mix(in oklab, ${ASPECT_COLOR[aspect]} 18%, transparent)`,
                                        color: ASPECT_COLOR[aspect],
                                        borderColor: `color-mix(in oklab, ${ASPECT_COLOR[aspect]} 35%, transparent)`,
                                      }
                                    : undefined
                                }
                              >
                                {ASPECT_LABEL[aspect]}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <GhostButton
                            onClick={() =>
                              setEditingId(editing ? null : group.id)
                            }
                          >
                            {editing ? "Done" : "Edit"}
                          </GhostButton>
                          <GhostButton
                            tone="danger"
                            onClick={() =>
                              dispatch({
                                type: "deleteSignalGroup",
                                intersectionId: config.id,
                                signalGroupId: group.id,
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

function KindBadge({ kind }: { kind: SignalGroupKind }) {
  const tone = KIND_TONE[kind];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em]",
        tone.border,
        tone.bg,
        tone.fg,
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}
