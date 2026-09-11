import { EngineeringReferencesBrowser } from "@/components/engineering-studio/engineering-references-browser";
import { StudioThemeProvider } from "@/components/studio-landing/theme-context";
import { fetchEngineeringIntersections } from "@/lib/engineering-studio-server";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

export const dynamic = "force-dynamic";

export default async function EngineeringReferencesPage() {
  let intersections: EngineeringIntersectionRecord[] = [];
  try {
    intersections = await fetchEngineeringIntersections();
  } catch {
    /* fall through */
  }

  return (
    <StudioThemeProvider>
      <EngineeringReferencesBrowser intersections={intersections} />
    </StudioThemeProvider>
  );
}
