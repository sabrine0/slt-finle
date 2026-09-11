"use client";

import clsx from "clsx";
import { useState } from "react";

import { ApproachesSection } from "@/components/studio/intersection-editor/approaches-section";
import { ControllerSection } from "@/components/studio/intersection-editor/controller-section";
import { DetectorsSection } from "@/components/studio/intersection-editor/detectors-section";
import { DiagramSection } from "@/components/studio/intersection-editor/diagram-section";
import { DossierImportModal } from "@/components/studio/dossier/dossier-import-modal";
import {
  GhostButton,
  PrimaryButton,
} from "@/components/studio/intersection-editor/form-controls";
import { IdentitySection } from "@/components/studio/intersection-editor/identity-section";
import { LanesSection } from "@/components/studio/intersection-editor/lanes-section";
import { ModesSection } from "@/components/studio/intersection-editor/modes-section";
import { MovementsSection } from "@/components/studio/intersection-editor/movements-section";
import { PlanSection } from "@/components/studio/intersection-editor/plan-section";
import { PhasesSection } from "@/components/studio/intersection-editor/phases-section";
import { SchematicSection } from "@/components/studio/intersection-editor/schematic-section";
import { SignalGroupsSection } from "@/components/studio/intersection-editor/signal-groups-section";
import { ValidationBadge } from "@/components/studio/intersection-editor/validation-badge";
import {
  useStudioDispatch,
  useStudioIntersection,
  useStudioIsDirty,
} from "@/components/studio/state/store";
import type {
  IntersectionConfig,
  SignalGroupKind,
} from "@/components/studio/state/types";

type EditorSection =
  | "plan"
  | "diagram"
  | "schematic"
  | "identity"
  | "approaches"
  | "lanes"
  | "signal-groups"
  | "movements"
  | "phases"
  | "detectors"
  | "modes"
  | "controller";

const SECTIONS: Array<{ id: EditorSection; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "diagram", label: "Diagram" },
  { id: "schematic", label: "Live" },
  { id: "identity", label: "Identity" },
  { id: "approaches", label: "Approaches" },
  { id: "lanes", label: "Lanes" },
  { id: "signal-groups", label: "Signal groups" },
  { id: "movements", label: "Movements" },
  { id: "phases", label: "Phases & Stages" },
  { id: "detectors", label: "Detectors" },
  { id: "modes", label: "Modes" },
  { id: "controller", label: "Controller" },
];

export function IntersectionEditor({ intersectionId }: { intersectionId: string }) {
  const config = useStudioIntersection(intersectionId);
  const dispatch = useStudioDispatch();
  const dirty = useStudioIsDirty(intersectionId);
  const [active, setActive] = useState<EditorSection>("plan");
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState<"regulation" | "cablage" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // "Régulation" / "Câblage" open the AI étude (the real dossier) for
  // this intersection — finding an existing one by code + scope, or
  // creating it — then navigating to the étude workspace where the
  // sections are generated and exported. Régulation → scope "standard",
  // Câblage → scope "cablage".
  const handleExport = async (kind: "regulation" | "cablage") => {
    if (!config) return;
    const scope = kind === "cablage" ? "cablage" : "standard";
    setExporting(kind);
    setExportError(null);
    // Open the tab synchronously so the popup blocker doesn't kill it;
    // we set its URL once the étude id is known.
    const tab = window.open("", "_blank");
    try {
      const { listEtudes, createEtude } = await import(
        "@/lib/etudes-api"
      );
      const code = config.code ?? config.id;
      const existing = (await listEtudes()).find(
        (e) => e.intersectionCode === code && e.scope === scope,
      );
      const etude =
        existing ??
        (await createEtude({
          intersectionCode: code,
          intersectionLabel: config.identity.name || code,
          latitude: config.identity.location?.lat ?? null,
          longitude: config.identity.location?.lng ?? null,
          scope,
        }));
      const url = `/studio/etude/${etude.id}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setExportError(
        err instanceof Error ? err.message : "Ouverture du dossier échouée",
      );
    } finally {
      setExporting(null);
    }
  };

  const handleApplyImport = (imported: IntersectionConfig) => {
    dispatch({
      type: "replaceIntersection",
      intersectionId,
      config: imported,
      markBaseline: false,
    });
  };

  if (!config) {
    return (
      <div className="grid h-full place-items-center px-10 text-center">
        <div>
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em] text-ink-3">
            Intersection
          </p>
          <h2 className="mt-3 text-[1.2rem] font-semibold text-ink-1">
            {intersectionId} is not yet loaded in Studio.
          </h2>
          <p className="mt-2 text-[0.84rem] text-ink-2">
            This intersection is either not in the current project or has not yet
            been hydrated from local storage.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke-0 bg-surface-1 px-4 py-1.5">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1
            className="truncate text-[0.95rem] font-semibold text-ink-0"
            title={`${config.identity.address} · ${config.identity.district}`}
          >
            {config.identity.name}
          </h1>
          <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            {config.id}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <ValidationBadge config={config} />
          {dirty ? (
            <span className="flex items-center gap-1 rounded-full border border-sig-yellow-stroke bg-sig-yellow-surface px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-sig-yellow-ink">
              <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
              Unsaved
            </span>
          ) : (
            <span className="rounded-full border border-sig-green-stroke bg-sig-green-surface px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-sig-green-ink">
              Saved
            </span>
          )}
          <GhostButton
            onClick={() => dispatch({ type: "reset", intersectionId })}
            disabled={!dirty}
          >
            Discard
          </GhostButton>
          <PrimaryButton
            onClick={() => dispatch({ type: "save", intersectionId })}
            disabled={!dirty}
          >
            Save
          </PrimaryButton>
          <div className="mx-0.5 h-4 w-px bg-stroke-1" aria-hidden />
          <GhostButton onClick={() => setImportOpen(true)}>
            Import
          </GhostButton>
          <GhostButton
            onClick={() => void handleExport("regulation")}
            disabled={exporting !== null}
          >
            {exporting === "regulation" ? "…" : "Régulation"}
          </GhostButton>
          <GhostButton
            onClick={() => void handleExport("cablage")}
            disabled={exporting !== null}
          >
            {exporting === "cablage" ? "…" : "Câblage"}
          </GhostButton>
        </div>
      </header>

      {exportError ? (
        <div className="border-b border-danger-stroke bg-danger-surface/60 px-6 py-1.5 text-[0.72rem] text-danger-ink">
          Ouverture du dossier échouée · {exportError}
        </div>
      ) : null}

      <DossierImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApply={handleApplyImport}
        targetIntersectionId={intersectionId}
      />

      <div className="flex items-center gap-0.5 border-b border-stroke-0 bg-surface-1 px-2 py-0.5">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActive(section.id)}
            className={clsx(
              "relative rounded-[4px] px-2 py-1 text-[0.7rem] font-medium transition",
              active === section.id
                ? "bg-accent-surface text-accent-ink ring-1 ring-accent-stroke"
                : "text-ink-2 hover:bg-hover hover:text-ink-1",
            )}
          >
            {section.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-2 text-[0.6rem] uppercase tracking-[0.2em] text-ink-3">
          <span>
            ap{" "}
            <span className="font-mono text-ink-1">{config.approaches.length}</span>
          </span>
          <span>
            ln{" "}
            <span className="font-mono text-ink-1">
              {(config.lanes ?? []).length}
            </span>
          </span>
          <span>
            sg <span className="font-mono text-ink-1">{config.signalGroups.length}</span>
          </span>
          <span>
            mv{" "}
            <span className="font-mono text-ink-1">
              {(config.movements ?? []).length}
            </span>
          </span>
          <span>
            dt <span className="font-mono text-ink-1">{config.detectors.length}</span>
          </span>
          <span>
            ph <span className="font-mono text-ink-1">{config.phases.length}</span>
          </span>
          <span>
            md{" "}
            <span className="font-mono text-ink-1">
              {(config.modes ?? []).length}
            </span>
          </span>
          <ModalKindBadges config={config} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {active === "plan" ? <PlanSection config={config} /> : null}
        {active === "diagram" ? <DiagramSection config={config} /> : null}
        {active === "schematic" ? <SchematicSection config={config} /> : null}
        {active === "identity" ? <IdentitySection config={config} /> : null}
        {active === "approaches" ? <ApproachesSection config={config} /> : null}
        {active === "lanes" ? <LanesSection config={config} /> : null}
        {active === "signal-groups" ? <SignalGroupsSection config={config} /> : null}
        {active === "movements" ? <MovementsSection config={config} /> : null}
        {active === "phases" ? <PhasesSection config={config} /> : null}
        {active === "detectors" ? <DetectorsSection config={config} /> : null}
        {active === "modes" ? <ModesSection config={config} /> : null}
        {active === "controller" ? <ControllerSection config={config} /> : null}
      </div>
    </div>
  );
}

/**
 * Small pills that advertise which non-vehicle modes this intersection
 * uses.  Derived from the presence of signal groups / lanes with the
 * matching kind or type, so it lights up as soon as the operator
 * models a tram / bus / pedestrian-crossing / emergency movement.
 */
function ModalKindBadges({ config }: { config: IntersectionConfig }) {
  const kinds = new Set<SignalGroupKind>();
  for (const sg of config.signalGroups) {
    const k = sg.kind ?? "vehicle";
    if (k !== "vehicle") kinds.add(k);
  }
  for (const lane of config.lanes ?? []) {
    if (lane.type === "tram") kinds.add("tram");
    if (lane.type === "busway") kinds.add("busway");
    if (lane.type === "pedestrian-crossing") kinds.add("pedestrian");
    if (lane.type === "emergency") kinds.add("emergency");
  }
  if (kinds.size === 0) return null;
  const TONE: Record<
    SignalGroupKind,
    { label: string; cls: string }
  > = {
    vehicle: { label: "VEH", cls: "" },
    tram: {
      label: "TRAM",
      cls: "border-[#c04a72]/60 bg-[#2a0f18] text-[#ff9ab8]",
    },
    busway: {
      label: "BUS",
      cls: "border-[#ff9a4a]/60 bg-[#2a1908] text-[#ffb87a]",
    },
    pedestrian: {
      label: "PED",
      cls: "border-accent-stroke bg-accent-surface text-accent-ink",
    },
    emergency: {
      label: "EMG",
      cls: "border-danger-stroke bg-danger-surface text-danger-ink",
    },
  };
  return (
    <span className="flex items-center gap-1">
      {(["tram", "busway", "pedestrian", "emergency"] as SignalGroupKind[])
        .filter((k) => kinds.has(k))
        .map((k) => {
          const tone = TONE[k];
          return (
            <span
              key={k}
              className={clsx(
                "rounded-[3px] border px-1 py-px text-[0.56rem] font-semibold uppercase tracking-[0.16em]",
                tone.cls,
              )}
            >
              {tone.label}
            </span>
          );
        })}
    </span>
  );
}
