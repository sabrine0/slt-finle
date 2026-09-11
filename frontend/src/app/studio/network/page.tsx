import { StudioShell } from "@/components/studio/studio-shell";
import { fetchEngineeringIntersections } from "@/lib/engineering-studio-server";
import {
  fetchTrafficGraphCarrefours,
  fetchTrafficGraphConnections,
} from "@/lib/traffic-graph-api";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";
import type {
  TrafficGraphCarrefourSummary,
  TrafficGraphConnectedView,
} from "@/types/traffic-graph";

export const dynamic = "force-dynamic";

export default async function StudioNetworkPage() {
  let intersections: EngineeringIntersectionRecord[] = [];
  let graphCarrefours: TrafficGraphCarrefourSummary[] = [];
  let graphLinks: TrafficGraphConnectedView[] = [];

  try {
    intersections = await fetchEngineeringIntersections();
  } catch {
    /* fall through */
  }

  try {
    [graphCarrefours, graphLinks] = await Promise.all([
      fetchTrafficGraphCarrefours(),
      fetchTrafficGraphConnections(),
    ]);
  } catch {
    /* fall through */
  }

  return (
    <StudioShell
      intersections={intersections}
      graphCarrefours={graphCarrefours}
      graphLinks={graphLinks}
      initialTabKind="network"
    />
  );
}
