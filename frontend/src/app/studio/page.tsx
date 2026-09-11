import { StudioLanding } from "@/components/studio-landing/studio-landing";
import { fetchEngineeringIntersections } from "@/lib/engineering-studio-server";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  let intersections: EngineeringIntersectionRecord[] = [];
  try {
    intersections = await fetchEngineeringIntersections();
  } catch {
    /* fall through with empty list — landing handles the empty state */
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <StudioLanding
      intersections={intersections}
      apiKey={apiKey}
      projectName="STLS Pilot — Casablanca"
    />
  );
}
