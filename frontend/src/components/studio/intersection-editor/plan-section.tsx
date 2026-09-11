"use client";

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";

import {
  CivilPlanRenderer,
  lightPlanTheme,
} from "@/components/studio-landing/civil-plan-renderer";
import { LocateImportWizard } from "@/components/studio/intersection-editor/locate-import-wizard";
import { buildSampleCivilPlan } from "@/lib/civil-plan-samples";
import {
  useStudioDispatch,
  useStudioIntersection,
} from "@/components/studio/state/store";
import {
  WORKFLOW_ORDER,
  type IntersectionConfig,
  type WorkflowStatus,
} from "@/components/studio/state/types";
import type {
  BasePlanSource,
  CableChamber,
  CivilPlan,
  CivilPlanLayer,
  DetectorLoop,
  SupportKind,
} from "@/types/civil-plan";

/**
 * Plan d'aménagement — editable civil-plan surface.
 *
 * This is the first real step of the engineering workflow: the BE
 * edits supports / loops / chambers here, the renderer previews the
 * layout, the AutoCAD page reads the same data out of the store, and
 * both dossiers (Régulation and Câblage) consume it downstream.
 *
 * The first time this tab is opened for an intersection that has no
 * civilPlan yet, we seed one from buildSampleCivilPlan so the
 * operator has real geometry to edit instead of a blank canvas.
 */

interface PlanSectionProps {
  config: IntersectionConfig;
}

const LAYERS: Array<{ id: CivilPlanLayer; label: string }> = [
  { id: "roads", label: "Roads" },
  { id: "lanes", label: "Lane markings" },
  { id: "crosswalks", label: "Crosswalks" },
  { id: "supports", label: "Supports" },
  { id: "loops", label: "Loops" },
  { id: "chambers", label: "Chambers" },
  { id: "cables", label: "Cables" },
  { id: "labels", label: "Labels" },
];

const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  draft_plan: "Draft plan",
  validated_plan: "Plan validated",
  regulation_ready: "Régulation ready",
  cablage_ready: "Câblage ready",
  programming_ready: "Programming ready",
  approved: "Approved",
};

export function PlanSection({ config }: PlanSectionProps) {
  const dispatch = useStudioDispatch();
  const persisted = useStudioIntersection(config.id);
  const civilPlan = persisted?.civilPlan;
  const workflowStatus = persisted?.workflowStatus ?? "draft_plan";
  const revision = persisted?.revision ?? "A";

  const [visibility, setVisibility] = useState<Record<CivilPlanLayer, boolean>>({
    backdrop: true,
    roads: true,
    lanes: true,
    crosswalks: true,
    islands: true,
    movements: true,
    supports: true,
    loops: true,
    chambers: true,
    cables: true,
    labels: true,
    legend: true,
  });

  const [wizardOpen, setWizardOpen] = useState(false);

  const toggleLayer = (layer: CivilPlanLayer) => {
    setVisibility((current) => ({ ...current, [layer]: !current[layer] }));
  };

  const handleSeedSample = useCallback(() => {
    const plan = buildSampleCivilPlan(config.id, config.identity.name);
    plan.basePlan = {
      source: "template",
      mapCenter: config.identity.location,
      importedAt: new Date().toISOString(),
      note: "Template fallback seeded from Plan tab",
    };
    dispatch({ type: "setCivilPlan", intersectionId: config.id, plan });
  }, [dispatch, config.id, config.identity.name, config.identity.location]);

  if (!civilPlan || wizardOpen) {
    return (
      <LocateImportWizard
        config={config}
        onFallbackToTemplate={() => setWizardOpen(false)}
      />
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="flex items-start justify-between gap-4 border-b border-stroke-0 px-4 py-3">
        <div>
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
            Plan d&apos;aménagement · step 1 of 4
          </p>
          <h2 className="mt-0.5 text-[1rem] font-semibold text-ink-1">
            Editable civil-plan source of truth
          </h2>
          <p className="mt-0.5 text-[0.72rem] text-ink-2">
            Everything you change here flows into AutoCAD, Dossier Régulation,
            Dossier Câblage and the Programmer.
          </p>
          <BasePlanStatus
            source={civilPlan.basePlan?.source}
            featureCount={civilPlan.baseLayers?.length ?? 0}
            onEdit={() => setWizardOpen(true)}
          />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <WorkflowBadge status={workflowStatus} />
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Revision {revision}
          </span>
        </div>
      </header>

      <div className="grid flex-1 min-h-0 gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-[420px] flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {LAYERS.map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => toggleLayer(layer.id)}
                className={clsx(
                  "rounded-[6px] border px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] transition",
                  visibility[layer.id]
                    ? "border-accent-stroke bg-accent-surface text-accent-ink"
                    : "border-stroke-0 bg-surface-1 text-ink-3 hover:text-ink-1",
                )}
              >
                {visibility[layer.id] ? "●" : "○"} {layer.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden rounded-[8px] border border-stroke-0 bg-white">
            <CivilPlanRenderer
              plan={civilPlan}
              layers={visibility}
              theme={lightPlanTheme}
            />
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <WorkflowControl
            intersectionId={config.id}
            current={workflowStatus}
            revision={revision}
            onReseed={handleSeedSample}
          />
          <SupportsEditor plan={civilPlan} intersectionId={config.id} />
          <LoopsEditor plan={civilPlan} intersectionId={config.id} />
          <ChambersEditor plan={civilPlan} intersectionId={config.id} />
        </aside>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Base plan status chip
// ──────────────────────────────────────────────────────────────────────

const BASE_PLAN_SOURCE_LABEL: Record<BasePlanSource, string> = {
  google_located: "Located on map",
  topoexport: "TopoExport",
  dxf: "DXF",
  svg: "SVG",
  geojson: "GeoJSON",
  osm: "OpenStreetMap (live)",
  template: "Template fallback",
};

function BasePlanStatus({
  source,
  featureCount,
  onEdit,
}: {
  source: BasePlanSource | undefined;
  featureCount: number;
  onEdit: () => void;
}) {
  const label = source ? BASE_PLAN_SOURCE_LABEL[source] : "Not located";
  const isTemplate = !source || source === "template";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.66rem]">
      <span
        className={clsx(
          "rounded-full border px-2 py-0.5 font-semibold uppercase tracking-[0.18em]",
          isTemplate
            ? "border-sig-yellow-stroke bg-sig-yellow-surface text-sig-yellow-ink"
            : "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink",
        )}
      >
        Base · {label}
      </span>
      {!isTemplate && featureCount > 0 ? (
        <span className="text-ink-3">{featureCount} base features</span>
      ) : null}
      <button
        type="button"
        onClick={onEdit}
        className="rounded-[4px] border border-stroke-0 bg-surface-2 px-2 py-0.5 font-semibold uppercase tracking-[0.18em] text-ink-2 hover:text-ink-0"
      >
        {isTemplate ? "Locate & import real base" : "Update base plan"}
      </button>
    </div>
  );
}


// ──────────────────────────────────────────────────────────────────────
// Workflow control
// ──────────────────────────────────────────────────────────────────────

function WorkflowControl({
  intersectionId,
  current,
  revision,
  onReseed,
}: {
  intersectionId: string;
  current: WorkflowStatus;
  revision: string;
  onReseed: () => void;
}) {
  const dispatch = useStudioDispatch();
  const currentIndex = WORKFLOW_ORDER.indexOf(current);
  return (
    <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-3">
      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
        Workflow
      </p>
      <ol className="mt-2 space-y-1 text-[0.72rem]">
        {WORKFLOW_ORDER.map((status, index) => {
          const done = index <= currentIndex;
          const isNext = index === currentIndex + 1;
          return (
            <li
              key={status}
              className={clsx(
                "flex items-center gap-2 rounded-[6px] px-2 py-1",
                done ? "bg-accent-surface text-accent-ink" : "text-ink-3",
              )}
            >
              <span
                className={clsx(
                  "grid h-4 w-4 place-items-center rounded-full border text-[0.58rem] font-bold",
                  done
                    ? "border-accent-stroke bg-accent-surface text-accent-ink"
                    : "border-stroke-1 text-ink-3",
                )}
              >
                {done ? "✓" : index + 1}
              </span>
              <span className="flex-1">{WORKFLOW_LABELS[status]}</span>
              {isNext ? (
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "setWorkflowStatus",
                      intersectionId,
                      status,
                    })
                  }
                  className="rounded-[4px] border border-accent-stroke bg-accent-surface px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110"
                >
                  Promote
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1.5">
          <span className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Rev
          </span>
          <input
            type="text"
            value={revision}
            onChange={(event) =>
              dispatch({
                type: "setRevision",
                intersectionId,
                revision: event.target.value.slice(0, 6),
              })
            }
            className="w-full bg-transparent text-[0.78rem] font-mono text-ink-1 outline-none"
          />
        </label>
        <button
          type="button"
          onClick={onReseed}
          className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink-0"
          title="Reset plan geometry from template"
        >
          Reseed
        </button>
      </div>
    </section>
  );
}

function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  return (
    <span
      className={clsx(
        "rounded-full px-2.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.22em]",
        status === "approved"
          ? "bg-sig-green-surface text-sig-green-ink"
          : status === "programming_ready"
            ? "bg-sig-green-surface text-sig-green-ink"
            : status === "cablage_ready" || status === "regulation_ready"
              ? "bg-accent-surface text-accent-ink"
              : status === "validated_plan"
                ? "bg-accent-surface text-accent-ink"
                : "bg-surface-2 text-ink-3",
      )}
    >
      {WORKFLOW_LABELS[status]}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Supports editor
// ──────────────────────────────────────────────────────────────────────

function SupportsEditor({
  plan,
  intersectionId,
}: {
  plan: CivilPlan;
  intersectionId: string;
}) {
  const dispatch = useStudioDispatch();
  const kinds: SupportKind[] = ["potence", "poteau", "potelet"];
  const nextId = useMemo(() => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const used = new Set(plan.supports.map((s) => s.id));
    for (const letter of letters) if (!used.has(letter)) return letter;
    return `S${plan.supports.length + 1}`;
  }, [plan.supports]);

  return (
    <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
          Supports · {plan.supports.length}
        </p>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: "addSupport",
              intersectionId,
              support: {
                id: nextId,
                kind: "potelet",
                position: { x: 0, y: 0 },
                hardwareLabel: "R12",
                signalHeads: [],
              },
            })
          }
          className="rounded-[4px] border border-accent-stroke bg-accent-surface px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110"
        >
          + Add
        </button>
      </div>
      <ul className="mt-2 space-y-1.5 text-[0.7rem]">
        {plan.supports.map((support) => (
          <li
            key={support.id}
            className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={support.id}
                onChange={(event) =>
                  dispatch({
                    type: "updateSupport",
                    intersectionId,
                    supportId: support.id,
                    patch: {
                      id: event.target.value.toUpperCase().slice(0, 4),
                    },
                  })
                }
                className="w-10 bg-transparent font-mono text-ink-1 outline-none"
                aria-label="Support code"
              />
              <select
                value={support.kind}
                onChange={(event) =>
                  dispatch({
                    type: "updateSupport",
                    intersectionId,
                    supportId: support.id,
                    patch: { kind: event.target.value as SupportKind },
                  })
                }
                className="rounded-[4px] border border-stroke-0 bg-surface-1 px-1 py-0.5 text-[0.66rem] text-ink-1 outline-none"
              >
                {kinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={support.hardwareLabel}
                onChange={(event) =>
                  dispatch({
                    type: "updateSupport",
                    intersectionId,
                    supportId: support.id,
                    patch: { hardwareLabel: event.target.value },
                  })
                }
                className="flex-1 bg-transparent text-ink-1 outline-none"
                placeholder="Hardware (e.g. R11v + R12)"
              />
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "deleteSupport",
                    intersectionId,
                    supportId: support.id,
                  })
                }
                className="rounded-[4px] border border-sig-red-stroke bg-sig-red-surface px-1.5 py-0.5 text-[0.56rem] font-semibold text-sig-red-ink transition hover:brightness-110"
                aria-label={`Delete support ${support.id}`}
              >
                ✕
              </button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[0.62rem] text-ink-3">
              <label className="flex items-center gap-1">
                x
                <input
                  type="number"
                  step="0.5"
                  value={support.position.x}
                  onChange={(event) =>
                    dispatch({
                      type: "updateSupport",
                      intersectionId,
                      supportId: support.id,
                      patch: {
                        position: {
                          ...support.position,
                          x: Number(event.target.value) || 0,
                        },
                      },
                    })
                  }
                  className="w-full rounded-[4px] border border-stroke-0 bg-surface-1 px-1 py-0.5 font-mono text-ink-1 outline-none"
                />
              </label>
              <label className="flex items-center gap-1">
                y
                <input
                  type="number"
                  step="0.5"
                  value={support.position.y}
                  onChange={(event) =>
                    dispatch({
                      type: "updateSupport",
                      intersectionId,
                      supportId: support.id,
                      patch: {
                        position: {
                          ...support.position,
                          y: Number(event.target.value) || 0,
                        },
                      },
                    })
                  }
                  className="w-full rounded-[4px] border border-stroke-0 bg-surface-1 px-1 py-0.5 font-mono text-ink-1 outline-none"
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Loops editor
// ──────────────────────────────────────────────────────────────────────

function LoopsEditor({
  plan,
  intersectionId,
}: {
  plan: CivilPlan;
  intersectionId: string;
}) {
  const dispatch = useStudioDispatch();
  return (
    <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
          Boucles · {plan.loops.length}
        </p>
        <button
          type="button"
          onClick={() => {
            const nextNumber = plan.loops.length + 1;
            const id = `Bcl-${String(nextNumber).padStart(2, "0")}`;
            const loop: DetectorLoop = {
              id,
              label: id,
              centre: { x: 0, y: 10 },
              width: 2,
              length: 2,
              angle: 0,
            };
            dispatch({ type: "addLoop", intersectionId, loop });
          }}
          className="rounded-[4px] border border-accent-stroke bg-accent-surface px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110"
        >
          + Add
        </button>
      </div>
      <ul className="mt-2 space-y-1.5 text-[0.7rem]">
        {plan.loops.map((loop) => (
          <li
            key={loop.id}
            className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={loop.label}
                onChange={(event) =>
                  dispatch({
                    type: "updateLoop",
                    intersectionId,
                    loopId: loop.id,
                    patch: { label: event.target.value, id: event.target.value },
                  })
                }
                className="flex-1 bg-transparent font-mono text-ink-1 outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "deleteLoop",
                    intersectionId,
                    loopId: loop.id,
                  })
                }
                className="rounded-[4px] border border-sig-red-stroke bg-sig-red-surface px-1.5 py-0.5 text-[0.56rem] font-semibold text-sig-red-ink transition hover:brightness-110"
              >
                ✕
              </button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[0.62rem] text-ink-3">
              <label className="flex items-center gap-1">
                x
                <input
                  type="number"
                  step="0.5"
                  value={loop.centre.x}
                  onChange={(event) =>
                    dispatch({
                      type: "updateLoop",
                      intersectionId,
                      loopId: loop.id,
                      patch: {
                        centre: {
                          ...loop.centre,
                          x: Number(event.target.value) || 0,
                        },
                      },
                    })
                  }
                  className="w-full rounded-[4px] border border-stroke-0 bg-surface-1 px-1 py-0.5 font-mono text-ink-1 outline-none"
                />
              </label>
              <label className="flex items-center gap-1">
                y
                <input
                  type="number"
                  step="0.5"
                  value={loop.centre.y}
                  onChange={(event) =>
                    dispatch({
                      type: "updateLoop",
                      intersectionId,
                      loopId: loop.id,
                      patch: {
                        centre: {
                          ...loop.centre,
                          y: Number(event.target.value) || 0,
                        },
                      },
                    })
                  }
                  className="w-full rounded-[4px] border border-stroke-0 bg-surface-1 px-1 py-0.5 font-mono text-ink-1 outline-none"
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Chambers editor
// ──────────────────────────────────────────────────────────────────────

function ChambersEditor({
  plan,
  intersectionId,
}: {
  plan: CivilPlan;
  intersectionId: string;
}) {
  const dispatch = useStudioDispatch();
  return (
    <section className="rounded-[8px] border border-stroke-0 bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
          Chambres · {plan.chambers.length}
        </p>
        <button
          type="button"
          onClick={() => {
            const nextNumber = plan.chambers.length + 1;
            const chamber: CableChamber = {
              id: String(nextNumber),
              label: String(nextNumber),
              position: { x: 0, y: 0 },
            };
            dispatch({ type: "addChamber", intersectionId, chamber });
          }}
          className="rounded-[4px] border border-accent-stroke bg-accent-surface px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-accent-ink transition hover:brightness-110"
        >
          + Add
        </button>
      </div>
      <ul className="mt-2 space-y-1.5 text-[0.7rem]">
        {plan.chambers.map((chamber) => (
          <li
            key={chamber.id}
            className="rounded-[6px] border border-stroke-0 bg-surface-2 px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chamber.label}
                onChange={(event) =>
                  dispatch({
                    type: "updateChamber",
                    intersectionId,
                    chamberId: chamber.id,
                    patch: { label: event.target.value },
                  })
                }
                className="w-16 bg-transparent font-mono text-ink-1 outline-none"
              />
              <input
                type="number"
                step="0.5"
                value={chamber.position.x}
                onChange={(event) =>
                  dispatch({
                    type: "updateChamber",
                    intersectionId,
                    chamberId: chamber.id,
                    patch: {
                      position: {
                        ...chamber.position,
                        x: Number(event.target.value) || 0,
                      },
                    },
                  })
                }
                className="w-16 rounded-[4px] border border-stroke-0 bg-surface-1 px-1 py-0.5 font-mono text-ink-1 outline-none"
                aria-label="x"
              />
              <input
                type="number"
                step="0.5"
                value={chamber.position.y}
                onChange={(event) =>
                  dispatch({
                    type: "updateChamber",
                    intersectionId,
                    chamberId: chamber.id,
                    patch: {
                      position: {
                        ...chamber.position,
                        y: Number(event.target.value) || 0,
                      },
                    },
                  })
                }
                className="w-16 rounded-[4px] border border-stroke-0 bg-surface-1 px-1 py-0.5 font-mono text-ink-1 outline-none"
                aria-label="y"
              />
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "deleteChamber",
                    intersectionId,
                    chamberId: chamber.id,
                  })
                }
                className="rounded-[4px] border border-sig-red-stroke bg-sig-red-surface px-1.5 py-0.5 text-[0.56rem] font-semibold text-sig-red-ink transition hover:brightness-110"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
