import { EngineeringWorkspace } from "@/components/studio-landing/engineering-workspace";
import { StudioThemeProvider } from "@/components/studio-landing/theme-context";
import { fetchEngineeringIntersections } from "@/lib/engineering-studio-server";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ intersectionId: string }>;
}) {
  const { intersectionId } = await params;
  let intersections: EngineeringIntersectionRecord[] = [];
  try {
    intersections = await fetchEngineeringIntersections();
  } catch {
    /* fall through */
  }
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <StudioThemeProvider>
      <EngineeringWorkspace
        intersectionId={intersectionId}
        intersections={intersections}
        apiKey={apiKey}
      />
    </StudioThemeProvider>
  );
}
