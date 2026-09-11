/**
 * Civil-plan / dossier PDF export.
 *
 * Consolidates three deliverables for the AutoCAD page into a single
 * export function the UI can call with a discrete `kind`:
 *
 *  - "plan"        — topographic plan drawing only, A3 landscape
 *  - "regulation"  — dossier de régulation (cover + tables + plan)
 *  - "cablage"     — dossier de câblage (cover + cabling tables + plan)
 *
 * The plan drawing itself is emitted as @react-pdf/renderer primitives
 * (Svg / Rect / Line / Polyline / Text), so it scales cleanly and
 * prints at any size — there is no Google-tile raster in the output.
 */

import type { IntersectionConfig } from "@/components/studio/state/types";
import type { CivilPlan, CivilPlanLayer } from "@/types/civil-plan";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

export type CivilPlanExportKind = "plan" | "regulation" | "cablage";

export interface CivilPlanExportInput {
  plan: CivilPlan;
  intersection: EngineeringIntersectionRecord;
  kind: CivilPlanExportKind;
  projectName?: string;
  client?: string;
  revision?: string;
  /** Stored studio config — enriches dossiers with operator-authored
   *  regulation / cablage settings when provided. */
  storedConfig?: IntersectionConfig;
}

/** All layers on — for the PDF the operator wants the fully-annotated plan. */
const ALL_LAYERS: Record<CivilPlanLayer, boolean> = {
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
};

export async function exportCivilPlanDossier({
  plan,
  intersection,
  kind,
  projectName = "STLS Pilot",
  client = "Société Région Aménagement",
  revision = "V01",
  storedConfig,
}: CivilPlanExportInput): Promise<void> {
  // Lazy-load the heavy renderer so the AutoCAD page itself stays small.
  const [{ pdf }, { CivilPlanDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/studio-landing/civil-plan-pdf"),
  ]);

  const blob = await pdf(
    <CivilPlanDocument
      plan={plan}
      intersection={intersection}
      kind={kind}
      layers={ALL_LAYERS}
      projectName={projectName}
      client={client}
      revision={revision}
      storedConfig={storedConfig}
    />,
  ).toBlob();

  const filename = buildFilename(kind, plan.intersectionCode);
  triggerDownload(blob, filename);
}

function buildFilename(kind: CivilPlanExportKind, code: string): string {
  const prefix =
    kind === "plan"
      ? "Plan_amenagement"
      : kind === "regulation"
        ? "Dossier_regulation"
        : "Dossier_cablage";
  const date = new Date();
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `${prefix}_${safe(code)}_${stamp}.pdf`;
}

function safe(input: string): string {
  return input.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-");
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
