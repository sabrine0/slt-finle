import { notFound } from "next/navigation";

import { ControllerDetailView } from "@/components/engineering-studio/controller-detail-view";
import { StudioShell } from "@/components/engineering-studio/studio-shell";
import { fetchEngineeringController } from "@/lib/engineering-studio-server";

export const dynamic = "force-dynamic";

interface ControllerDetailPageProps {
  params: Promise<{
    controllerId: string;
  }>;
}

export default async function ControllerDetailPage({
  params,
}: ControllerDetailPageProps) {
  const { controllerId } = await params;
  const controller = await resolveController(controllerId);

  return (
    <StudioShell
      eyebrow="STLS Hybrid / Engineering Studio"
      title={controller.code}
      subtitle="Controller identity, runtime health, field assignment, detector mapping, credential inventory, and deployment acknowledgements."
      backHref="/engineering/controllers"
      backLabel="Controller Inventory"
    >
      <ControllerDetailView controller={controller} />
    </StudioShell>
  );
}

async function resolveController(controllerId: string) {
  try {
    return await fetchEngineeringController(controllerId);
  } catch {
    notFound();
  }
}
