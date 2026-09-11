import { notFound } from "next/navigation";

import { IntersectionDetailView } from "@/components/engineering-studio/intersection-detail-view";
import { StudioShell } from "@/components/engineering-studio/studio-shell";
import { fetchEngineeringIntersection } from "@/lib/engineering-studio-server";

export const dynamic = "force-dynamic";

interface IntersectionDetailPageProps {
  params: Promise<{
    intersectionId: string;
  }>;
}

export default async function IntersectionDetailPage({
  params,
}: IntersectionDetailPageProps) {
  const { intersectionId } = await params;
  const intersection = await resolveIntersection(intersectionId);

  return (
    <StudioShell
      eyebrow="STLS Hybrid / Engineering Studio"
      title={intersection.name}
      subtitle="Phase compatibility, timing strategies, detector mapping, and deployment history for a single controlled intersection."
      backHref="/engineering"
      backLabel="All Intersections"
    >
      <IntersectionDetailView intersection={intersection} />
    </StudioShell>
  );
}

async function resolveIntersection(intersectionId: string) {
  try {
    return await fetchEngineeringIntersection(intersectionId);
  } catch {
    notFound();
  }
}
