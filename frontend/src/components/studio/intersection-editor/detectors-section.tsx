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
  Detector,
  DetectorKind,
  IntersectionConfig,
} from "@/components/studio/state/types";

const KIND_OPTIONS: Array<{ value: DetectorKind; label: string }> = [
  { value: "loop", label: "Inductive loop" },
  { value: "radar", label: "Radar" },
  { value: "video", label: "Video analytics" },
  { value: "piezo", label: "Piezoelectric" },
  { value: "magnetometer", label: "Magnetometer" },
];

export function DetectorsSection({ config }: { config: IntersectionConfig }) {
  const dispatch = useStudioDispatch();
  const [editingId, setEditingId] = useState<string | null>(null);

  const approachOptions = config.approaches.map((approach) => ({
    value: approach.id,
    label: `${approach.bearing} — ${approach.label}`,
  }));

  const addDetector = () => {
    const nextIndex = config.detectors.length + 1;
    const id = `det-${nextIndex.toString().padStart(3, "0")}`;
    const next: Detector = {
      id,
      label: `Detector ${nextIndex}`,
      approachId: config.approaches[0]?.id,
      channel: `DI${nextIndex}`,
      kind: "loop",
    };
    dispatch({ type: "addDetector", intersectionId: config.id, detector: next });
    setEditingId(id);
  };

  return (
    <section className="flex flex-col">
      <SectionToolbar
        title="Detectors"
        subtitle="Vehicle/pedestrian sensors wired to controller input channels. Each detector typically reports to a specific approach."
        right={<PrimaryButton onClick={addDetector}>+ Add detector</PrimaryButton>}
      />

      <div className="px-6 py-5">
        {config.detectors.length === 0 ? (
          <p className="text-[0.84rem] text-ink-3">No detectors configured.</p>
        ) : (
          <div className="overflow-hidden rounded-[8px] border border-stroke-1">
            <table className="w-full text-left text-[0.82rem]">
              <thead className="bg-surface-2 text-[0.62rem] uppercase tracking-[0.2em] text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">Label</th>
                  <th className="px-3 py-2 font-semibold">Approach</th>
                  <th className="px-3 py-2 font-semibold">Channel</th>
                  <th className="px-3 py-2 font-semibold">Kind</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-0">
                {config.detectors.map((detector) => {
                  const editing = editingId === detector.id;
                  return (
                    <tr key={detector.id} className="bg-surface-1 align-top">
                      <td className="px-3 py-2 font-mono text-info-ink">{detector.id}</td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioInput
                            value={detector.label}
                            onChange={(value) =>
                              dispatch({
                                type: "updateDetector",
                                intersectionId: config.id,
                                detectorId: detector.id,
                                patch: { label: value },
                              })
                            }
                          />
                        ) : (
                          <span className="text-ink-1">{detector.label}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioSelect
                            value={detector.approachId ?? ""}
                            onChange={(value) =>
                              dispatch({
                                type: "updateDetector",
                                intersectionId: config.id,
                                detectorId: detector.id,
                                patch: { approachId: value || undefined },
                              })
                            }
                            options={approachOptions}
                          />
                        ) : (
                          <span className="text-[0.78rem] text-ink-1">
                            {detector.approachId
                              ? config.approaches.find(
                                  (appr) => appr.id === detector.approachId,
                                )?.label ?? detector.approachId
                              : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioInput
                            value={detector.channel}
                            onChange={(value) =>
                              dispatch({
                                type: "updateDetector",
                                intersectionId: config.id,
                                detectorId: detector.id,
                                patch: { channel: value },
                              })
                            }
                          />
                        ) : (
                          <span className="font-mono text-ink-1">{detector.channel}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <StudioSelect
                            value={detector.kind}
                            onChange={(value) =>
                              dispatch({
                                type: "updateDetector",
                                intersectionId: config.id,
                                detectorId: detector.id,
                                patch: { kind: (value || "loop") as DetectorKind },
                              })
                            }
                            options={KIND_OPTIONS}
                          />
                        ) : (
                          <span className="text-[0.78rem] text-ink-1">
                            {KIND_OPTIONS.find((option) => option.value === detector.kind)
                              ?.label ?? detector.kind}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <GhostButton
                            onClick={() =>
                              setEditingId(editing ? null : detector.id)
                            }
                          >
                            {editing ? "Done" : "Edit"}
                          </GhostButton>
                          <GhostButton
                            tone="danger"
                            onClick={() =>
                              dispatch({
                                type: "deleteDetector",
                                intersectionId: config.id,
                                detectorId: detector.id,
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
