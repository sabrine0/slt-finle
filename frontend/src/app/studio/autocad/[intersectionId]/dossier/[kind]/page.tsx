import { notFound } from "next/navigation";

import {
  DossierPreview,
  type DossierKind,
} from "@/components/studio-landing/dossier-preview";
import { fetchEngineeringIntersections } from "@/lib/engineering-studio-server";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

export const dynamic = "force-dynamic";

export default async function DossierPreviewPage({
  params,
}: {
  params: Promise<{ intersectionId: string; kind: string }>;
}) {
  const { intersectionId, kind } = await params;
  if (kind !== "regulation" && kind !== "cablage") {
    notFound();
  }

  let intersections: EngineeringIntersectionRecord[] = [];
  try {
    intersections = await fetchEngineeringIntersections();
  } catch {
    /* fall through */
  }

  const intersection = intersections.find((i) => i.id === intersectionId);
  if (!intersection) {
    notFound();
  }

  return (
    <DossierPreview
      kind={kind as DossierKind}
      intersection={intersection}
      projectName="STLS Pilot — Casablanca"
      clientName="SOCIETE FES REGION AMENAGEMENT"
    />
  );
}
