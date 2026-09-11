import { ControllerWorkspace } from "@/components/studio-landing/controller-workspace";
import { fetchEngineeringIntersections } from "@/lib/engineering-studio-server";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

export const dynamic = "force-dynamic";

export default async function ProgrammerWorkspacePage({
  params,
}: {
  params: Promise<{ controllerId: string }>;
}) {
  const { controllerId } = await params;
  let intersections: EngineeringIntersectionRecord[] = [];
  try {
    intersections = await fetchEngineeringIntersections();
  } catch {
    /* fall through */
  }

  return (
    <ControllerWorkspace
      intersections={intersections}
      selectedControllerId={controllerId}
    />
  );
}
