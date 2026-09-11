"use client";

import { StudioMapView } from "@/components/studio-landing/studio-map-view";
import { StudioThemeProvider } from "@/components/studio-landing/theme-context";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

interface StudioLandingProps {
  intersections: EngineeringIntersectionRecord[];
  apiKey?: string;
  projectName?: string;
}

export function StudioLanding({
  intersections,
  apiKey,
}: StudioLandingProps) {
  return (
    <StudioThemeProvider>
      <StudioMapView apiKey={apiKey} intersections={intersections} />
    </StudioThemeProvider>
  );
}
