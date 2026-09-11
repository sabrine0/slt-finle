/**
 * LocalStorage-backed network store for the Studio.
 *
 * Holds (1) map-created carrefours and (2) explicit intersection links.
 * The backend engineering intersections are immutable and come from the
 * server; this store is the operator's scratch pad until those
 * carrefours / links get promoted upstream.
 *
 * The store is deliberately dependency-free — every caller (project
 * explorer, network workspace, project-context merger) subscribes via
 * the `storage` event + a module-local listener set so in-tab mutations
 * also propagate instantly.
 */

import type {
  IntersectionLink,
  IntersectionLinkKind,
  MapCarrefour,
  NetworkStoreState,
} from "@/types/network";

const STORAGE_KEY = "stls.network.v1";

const EMPTY: NetworkStoreState = {
  version: 1,
  carrefours: [],
  links: [],
};

type Listener = () => void;

const listeners = new Set<Listener>();
let windowBound = false;

function ensureWindowListener() {
  if (typeof window === "undefined" || windowBound) return;
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      for (const listener of listeners) listener();
    }
  });
  windowBound = true;
}

function notify() {
  for (const listener of listeners) listener();
}

function readRaw(): NetworkStoreState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<NetworkStoreState>;
    if (!parsed || parsed.version !== 1) return EMPTY;
    return {
      version: 1,
      carrefours: Array.isArray(parsed.carrefours) ? parsed.carrefours : [],
      links: Array.isArray(parsed.links) ? parsed.links : [],
    };
  } catch {
    return EMPTY;
  }
}

function writeRaw(next: NetworkStoreState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage full / disabled — mutations become session-only */
  }
  notify();
}

export function readNetworkState(): NetworkStoreState {
  return readRaw();
}

export function subscribeToNetworkStore(listener: Listener): () => void {
  ensureWindowListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function addMapCarrefour(carrefour: MapCarrefour) {
  const current = readRaw();
  const next: NetworkStoreState = {
    ...current,
    carrefours: [
      ...current.carrefours.filter((entry) => entry.id !== carrefour.id),
      carrefour,
    ],
  };
  writeRaw(next);
}

export function updateMapCarrefour(
  id: string,
  patch: Partial<Omit<MapCarrefour, "id" | "source" | "createdAt">>,
) {
  const current = readRaw();
  const next: NetworkStoreState = {
    ...current,
    carrefours: current.carrefours.map((entry) =>
      entry.id === id
        ? { ...entry, ...patch, updatedAt: new Date().toISOString() }
        : entry,
    ),
  };
  writeRaw(next);
}

export function removeMapCarrefour(id: string) {
  const current = readRaw();
  const next: NetworkStoreState = {
    ...current,
    carrefours: current.carrefours.filter((entry) => entry.id !== id),
    // Cascade-remove links that reference the deleted carrefour.
    links: current.links.filter(
      (link) =>
        link.fromIntersectionId !== id && link.toIntersectionId !== id,
    ),
  };
  writeRaw(next);
}

export function addIntersectionLink(link: IntersectionLink) {
  const current = readRaw();
  if (
    current.links.some(
      (entry) =>
        (entry.fromIntersectionId === link.fromIntersectionId &&
          entry.toIntersectionId === link.toIntersectionId) ||
        (entry.fromIntersectionId === link.toIntersectionId &&
          entry.toIntersectionId === link.fromIntersectionId),
    )
  ) {
    return;
  }
  const next: NetworkStoreState = {
    ...current,
    links: [...current.links, link],
  };
  writeRaw(next);
}

export function removeIntersectionLink(id: string) {
  const current = readRaw();
  const next: NetworkStoreState = {
    ...current,
    links: current.links.filter((entry) => entry.id !== id),
  };
  writeRaw(next);
}

export function setIntersectionLinks(links: IntersectionLink[]) {
  const current = readRaw();
  writeRaw({ ...current, links });
}

// ─────────────────────────── geo helpers ───────────────────────────

export function distanceMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const phi1 = toRad(from.lat);
  const phi2 = toRad(to.lat);
  const dLambda = toRad(to.lng - from.lng);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Auto-suggest links between a set of carrefours using a nearest-
 *  neighbour heuristic bounded by a max radius.  Returns links that
 *  don't already exist in the current link set. */
export function suggestLinks(
  carrefours: Array<{ id: string; location: { lat: number; lng: number } }>,
  existingLinks: IntersectionLink[],
  {
    maxNeighbors = 3,
    maxRadiusMetres = 800,
  }: { maxNeighbors?: number; maxRadiusMetres?: number } = {},
): IntersectionLink[] {
  const existing = new Set<string>();
  for (const link of existingLinks) {
    const key = [link.fromIntersectionId, link.toIntersectionId].sort().join("|");
    existing.add(key);
  }
  const suggested: IntersectionLink[] = [];
  for (const a of carrefours) {
    const neighbors = carrefours
      .filter((b) => b.id !== a.id)
      .map((b) => ({
        id: b.id,
        location: b.location,
        distance: distanceMetres(a.location, b.location),
      }))
      .filter((entry) => entry.distance <= maxRadiusMetres)
      .sort((x, y) => x.distance - y.distance)
      .slice(0, maxNeighbors);
    for (const neighbor of neighbors) {
      const key = [a.id, neighbor.id].sort().join("|");
      if (existing.has(key)) continue;
      existing.add(key);
      const id = `lnk-sugg-${a.id}-${neighbor.id}`;
      suggested.push({
        id,
        fromIntersectionId: a.id,
        toIntersectionId: neighbor.id,
        kind: "suggested",
        distanceMetres: Math.round(neighbor.distance),
        bearingDeg: bearingDeg(a.location, neighbor.location),
        createdAt: new Date().toISOString(),
      });
    }
  }
  return suggested;
}

export function makeLinkId(kind: IntersectionLinkKind) {
  return `lnk-${kind}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function makeCarrefourId() {
  return `MAPC-${Date.now().toString(36).toUpperCase().slice(-4)}${Math.random()
    .toString(36)
    .toUpperCase()
    .slice(2, 4)}`;
}
