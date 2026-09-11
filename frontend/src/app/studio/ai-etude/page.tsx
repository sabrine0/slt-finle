import { AiEtudeWorkspace } from "@/components/studio-landing/ai-etude-workspace";
import { StudioThemeProvider } from "@/components/studio-landing/theme-context";

export const dynamic = "force-dynamic";

export default function AiEtudePage() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return (
    <StudioThemeProvider>
      <AiEtudeWorkspace apiKey={apiKey} />
    </StudioThemeProvider>
  );
}
