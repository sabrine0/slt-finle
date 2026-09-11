import { AutocadLayout } from "@/components/studio-landing/autocad-layout";
import { StudioThemeProvider } from "@/components/studio-landing/theme-context";
import { fetchEngineeringIntersections } from "@/lib/engineering-studio-server";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

export const dynamic = "force-dynamic";

export default async function AutocadLayoutPage({
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

  return (
    <StudioThemeProvider>
      <AutocadLayout
        intersections={intersections}
        selectedIntersectionId={intersectionId}
      />
    </StudioThemeProvider>
  );
}
