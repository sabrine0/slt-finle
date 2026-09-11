import { EtudeWorkspace } from "@/components/studio-landing/etude-workspace";
import { StudioThemeProvider } from "@/components/studio-landing/theme-context";

export const dynamic = "force-dynamic";

export default async function EtudePage({
  params,
}: {
  params: Promise<{ etudeId: string }>;
}) {
  const { etudeId } = await params;
  return (
    <StudioThemeProvider>
      <EtudeWorkspace etudeId={etudeId} />
    </StudioThemeProvider>
  );
}
