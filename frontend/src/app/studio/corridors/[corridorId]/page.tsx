import { CorridorSupervision } from "@/components/studio/corridors/corridor-supervision";
import { getApiBaseUrl } from "@/lib/command-platform-api";
import type { CorridorRuntimeSnapshot } from "@/types/corridors";

export const dynamic = "force-dynamic";

async function fetchCorridorRuntime(
  corridorId: string,
): Promise<{ snapshot: CorridorRuntimeSnapshot | null; error: string | null }> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/corridors/${encodeURIComponent(corridorId)}/runtime`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return {
        snapshot: null,
        error: `Backend responded ${response.status} ${response.statusText}`,
      };
    }
    const snapshot = (await response.json()) as CorridorRuntimeSnapshot;
    return { snapshot, error: null };
  } catch (error) {
    return {
      snapshot: null,
      error: error instanceof Error ? error.message : "Fetch failed",
    };
  }
}

export default async function CorridorSupervisionPage({
  params,
}: {
  params: Promise<{ corridorId: string }>;
}) {
  const { corridorId } = await params;
  const { snapshot, error } = await fetchCorridorRuntime(corridorId);

  return (
    <CorridorSupervision
      corridorId={corridorId}
      initialSnapshot={snapshot}
      initialError={error}
    />
  );
}
