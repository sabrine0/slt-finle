import { ProposalWorkspace } from "@/components/studio-landing/proposal-workspace";
import { StudioThemeProvider } from "@/components/studio-landing/theme-context";

export const dynamic = "force-dynamic";

export default async function ProposalWorkspacePage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return (
    <StudioThemeProvider>
      <ProposalWorkspace proposalId={proposalId} apiKey={apiKey} />
    </StudioThemeProvider>
  );
}
