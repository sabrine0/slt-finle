"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  readNetworkState,
  subscribeToNetworkStore,
} from "@/lib/network-store";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";
import type {
  IntersectionLink,
  MapCarrefour,
  NetworkStoreState,
} from "@/types/network";
import type {
  TrafficGraphCarrefourSummary,
  TrafficGraphConnectedView,
} from "@/types/traffic-graph";

interface StudioProjectContextValue {
  /** Merged list — backend engineering intersections plus locally-
   *  created map carrefours, cast to the same shape so existing
   *  consumers (explorer, plan section, dossiers, corridor page)
   *  don't need to branch. */
  intersections: EngineeringIntersectionRecord[];
  /** Backend intersections (immutable) kept separately for callers
   *  that must distinguish server vs local data (e.g. the controller
   *  / programmer workspaces). */
  backendIntersections: EngineeringIntersectionRecord[];
  /** Map-created carrefours in their native form. */
  mapCarrefours: MapCarrefour[];
  /** Explicit intersection-to-intersection links. */
  links: IntersectionLink[];
  /** Backend traffic-graph carrefour summaries — surface
   *  primaryControllerConnectionState and saturation/criticality
   *  scores that the controller-graph view needs. */
  graphCarrefours: TrafficGraphCarrefourSummary[];
  /** Backend traffic-graph connected_intersections — kept raw so
   *  views that don't need the legacy `road | corridor | suggested`
   *  vocabulary can use the upstream/downstream/parallel kinds. */
  graphLinks: TrafficGraphConnectedView[];
}

const StudioProjectContext = createContext<StudioProjectContextValue>({
  intersections: [],
  backendIntersections: [],
  mapCarrefours: [],
  links: [],
  graphCarrefours: [],
  graphLinks: [],
});

const EMPTY_NETWORK_STATE: NetworkStoreState = {
  version: 1,
  carrefours: [],
  links: [],
};

function carrefourToIntersectionRecord(
  carrefour: MapCarrefour,
): EngineeringIntersectionRecord {
  return {
    id: carrefour.id,
    code: carrefour.code,
    name: carrefour.name,
    district: carrefour.district ?? carrefour.city ?? "",
    address: carrefour.address ?? "",
    latitude: carrefour.location.lat,
    longitude: carrefour.location.lng,
    controlMode: "adaptive",
    status: "healthy",
    queueLength: 0,
    incidents: 0,
    averageDelaySeconds: 0,
    lastHeartbeat: null,
    controllers: [],
    detectors: [],
    phases: [],
    timingPlans: [],
    deployments: [],
  };
}

export function StudioProjectProvider({
  children,
  intersections: backend,
  graphCarrefours = [],
  graphLinks = [],
}: {
  children: ReactNode;
  intersections: EngineeringIntersectionRecord[];
  graphCarrefours?: TrafficGraphCarrefourSummary[];
  graphLinks?: TrafficGraphConnectedView[];
}) {
  const [network, setNetwork] = useState<NetworkStoreState>(
    EMPTY_NETWORK_STATE,
  );

  useEffect(() => {
    // Initial hydrate after mount (SSR returned EMPTY).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNetwork(readNetworkState());
    const unsubscribe = subscribeToNetworkStore(() => {
      setNetwork(readNetworkState());
    });
    return unsubscribe;
  }, []);

  const refresh = useCallback(() => {
    setNetwork(readNetworkState());
  }, []);
  void refresh; // reserved for future explicit refresh triggers

  const value = useMemo<StudioProjectContextValue>(() => {
    const mapped = network.carrefours.map(carrefourToIntersectionRecord);
    const graphToIntersectionId = new Map<string, string>();
    for (const carrefour of graphCarrefours) {
      if (carrefour.engineeringIntersectionId) {
        graphToIntersectionId.set(
          carrefour.id,
          carrefour.engineeringIntersectionId,
        );
      }
    }

    const backendLinks: IntersectionLink[] = [];
    for (const link of graphLinks) {
      const fromIntersectionId =
        graphToIntersectionId.get(link.fromCarrefourId) ?? null;
      const toIntersectionId =
        graphToIntersectionId.get(link.toCarrefourId) ?? null;
      if (!fromIntersectionId || !toIntersectionId) continue;
      backendLinks.push({
        id: link.id,
        fromIntersectionId,
        toIntersectionId,
        // The legacy local-store kind vocabulary (`road | corridor |
        // suggested`) is narrower than the backend graph's. Map
        // upstream/downstream → corridor (real road link), parallel →
        // suggested (a candidate edge), corridor stays corridor.
        kind:
          link.relationKind === "corridor"
            ? "corridor"
            : link.relationKind === "parallel"
              ? "suggested"
              : "road",
        path: [
          { lat: link.fromLat, lng: link.fromLng },
          { lat: link.toLat, lng: link.toLng },
        ],
        distanceMetres: link.distanceMetres ?? 0,
        bearingDeg: 0,
        travelTimeSeconds: link.travelTimeSeconds ?? undefined,
        createdAt: "backend",
      });
    }

    const mergedLinks: IntersectionLink[] = [...backendLinks];
    const seenLocal = new Set(
      mergedLinks.map((link) =>
        [link.fromIntersectionId, link.toIntersectionId].sort().join("|"),
      ),
    );
    for (const link of network.links) {
      const key = [link.fromIntersectionId, link.toIntersectionId]
        .sort()
        .join("|");
      if (seenLocal.has(key)) continue;
      seenLocal.add(key);
      mergedLinks.push(link);
    }

    return {
      backendIntersections: backend,
      intersections: [...backend, ...mapped],
      mapCarrefours: network.carrefours,
      links: mergedLinks,
      graphCarrefours,
      graphLinks,
    };
  }, [backend, graphCarrefours, graphLinks, network]);

  return (
    <StudioProjectContext.Provider value={value}>
      {children}
    </StudioProjectContext.Provider>
  );
}

export function useStudioProjectIntersections() {
  return useContext(StudioProjectContext).intersections;
}

export function useStudioBackendIntersections() {
  return useContext(StudioProjectContext).backendIntersections;
}

export function useStudioMapCarrefours() {
  return useContext(StudioProjectContext).mapCarrefours;
}

export function useStudioNetworkLinks() {
  return useContext(StudioProjectContext).links;
}

export function useStudioGraphCarrefours() {
  return useContext(StudioProjectContext).graphCarrefours;
}

export function useStudioGraphLinks() {
  return useContext(StudioProjectContext).graphLinks;
}

export function useStudioProjectIntersection(intersectionId: string | undefined) {
  const intersections = useStudioProjectIntersections();
  if (!intersectionId) return undefined;
  return intersections.find((item) => item.id === intersectionId);
}
