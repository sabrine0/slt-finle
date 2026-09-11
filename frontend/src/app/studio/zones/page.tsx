import { StudioThemeProvider } from "@/components/studio-landing/theme-context";
import { ZoneBuilder } from "@/components/studio-landing/zone-builder";

export const dynamic = "force-dynamic";

export default function ZoneBuilderPage() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <StudioThemeProvider>
      <ZoneBuilder apiKey={apiKey} projectName="STLS Pilot — Casablanca" />
    </StudioThemeProvider>
  );
}
