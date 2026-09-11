"use client";

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
  Approach,
  ApproachBearing,
  IntersectionConfig,
} from "@/components/studio/state/types";

const BEARING_OPTIONS: Array<{ value: ApproachBearing; label: string }> = [
  { value: "N", label: "N — North" },
  { value: "NE", label: "NE — North-East" },
  { value: "E", label: "E — East" },
  { value: "SE", label: "SE — South-East" },
  { value: "S", label: "S — South" },
  { value: "SW", label: "SW — South-West" },
  { value: "W", label: "W — West" },
  { value: "NW", label: "NW — North-West" },
];

export function ApproachesSection({ config }: { config: IntersectionConfig }) {
  const dispatch = useStudioDispatch();
  const [editingId, setEditingId] = useState<string | null>(null);

  const addApproach = () => {
    const usedBearings = new Set(config.approaches.map((appr) => appr.bearing));
    const available = BEARING_OPTIONS.find(
      (option) => !usedBearings.has(option.value),
    );
    const bearing = available?.value ?? "N";
    const id = `appr-${bearing.toLowerCase()}-${Date.now().toString(36).slice(-3)}`;
    const next: Approach = {
      id,
      bearing,
      label: `${BEARING_OPTIONS.find((o) => o.value === bearing)?.label.split(" — ")[1] ?? bearing}`,
      lanes: 2,
    };
    dispatch({ type: "addApproach", intersectionId: config.id, approach: next });
    setEditingId(id);
  };

  return (
    <section className="flex flex-col">
      <SectionToolbar
        title="Approaches"
        subtitle="Cardinal-bearing approaches into this intersection. Each carries a lane count and feeds signal groups + detectors."
        right={<PrimaryButton onClick={addApproach}>+ Add approach</PrimaryButton>}
      />

      <div className="px-6 py-5">
        {config.approaches.length === 0 ? (
          <p className="text-[0.84rem] text-ink-3">
            No approaches defined. Add at least one to start configuring signal
            groups and detectors.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[8px] border border-stroke-1">
            <table className="w-full text-left text-[0.82rem]">
              <thead className="bg-surface-2 text-[0.62rem] uppercase tracking-[0.2em] text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-semibold">Bearing</th>
                  <th className="px-3 py-2 font-semibold">Label</th>
                  <th className="px-3 py-2 font-semibold">Lanes</th>
                  <th className="px-3 py-2 font-semibold">Notes</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-0">
                {config.approaches.map((approach) => {
                  const editing = editingId === approach.id;
                  return (
                    <tr key={approach.id} className="bg-surface-1">
                      <td className="px-3 py-2 align-top">
                        {editing ? (
                          <StudioSelect
                            value={approach.bearing}
                            onChange={(value) =>
                              dispatch({
                                type: "updateApproach",
                                intersectionId: config.id,
                                approachId: approach.id,
                                patch: { bearing: (value || "N") as ApproachBearing },
                              })
                            }
                            options={BEARING_OPTIONS}
                          />
                        ) : (
                          <span className="font-mono text-sig-yellow-ink">
                            {approach.bearing}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {editing ? (
                          <StudioInput
                            value={approach.label}
                            onChange={(value) =>
                              dispatch({
                                type: "updateApproach",
                                intersectionId: config.id,
                                approachId: approach.id,
                                patch: { label: value },
                              })
                            }
                          />
                        ) : (
                          <span className="text-ink-1">{approach.label}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {editing ? (
                          <StudioInput
                            type="number"
                            value={approach.lanes}
                            onChange={(value) =>
                              dispatch({
                                type: "updateApproach",
                                intersectionId: config.id,
                                approachId: approach.id,
                                patch: { lanes: Math.max(1, Math.min(8, Number(value) || 1)) },
                              })
                            }
                          />
                        ) : (
                          <span className="font-mono text-ink-1">{approach.lanes}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {editing ? (
                          <StudioInput
                            value={approach.notes ?? ""}
                            onChange={(value) =>
                              dispatch({
                                type: "updateApproach",
                                intersectionId: config.id,
                                approachId: approach.id,
                                patch: { notes: value || undefined },
                              })
                            }
                          />
                        ) : (
                          <span className="text-[0.78rem] text-ink-2">
                            {approach.notes ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <div className="flex items-center justify-end gap-2">
                          <GhostButton
                            onClick={() =>
                              setEditingId(editing ? null : approach.id)
                            }
                          >
                            {editing ? "Done" : "Edit"}
                          </GhostButton>
                          <GhostButton
                            tone="danger"
                            onClick={() =>
                              dispatch({
                                type: "deleteApproach",
                                intersectionId: config.id,
                                approachId: approach.id,
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
