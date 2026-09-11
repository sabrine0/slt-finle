/**
 * Thin client-side helper to read the Studio intersection store from
 * localStorage outside of a StudioStoreProvider.
 *
 * The AutoCAD page and the Dossier preview/export flows live outside
 * the workbench shell (different routes, no provider), but they need
 * to consume the editable civilPlan + dossier settings that the
 * workbench writes. Instead of wrapping those routes in a provider —
 * which would require changes to half the app and hydration dances —
 * we just read the same `stls-studio-state-v1` key that the reducer
 * persists to.
 *
 * Keep this module server-safe: every function guards for
 * `typeof window === "undefined"` so it can be imported from routes
 * that are partially server-rendered.
 */

import type { IntersectionConfig } from "@/components/studio/state/types";
import type { CivilPlan } from "@/types/civil-plan";

const STORAGE_KEY = "stls-studio-state-v1";
const SAME_TAB_EVENT = "stls-studio-state:updated";

export interface StudioStoreSnapshot {
  version: number;
  intersections: Record<string, IntersectionConfig>;
}

export function readStudioStore(): StudioStoreSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudioStoreSnapshot;
    if (!parsed || !parsed.intersections) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readIntersectionConfig(
  intersectionKey: string,
): IntersectionConfig | null {
  const snapshot = readStudioStore();
  if (!snapshot) return null;
  // Lookup is case-insensitive — the workbench persists whatever id the
  // operator typed, but the AutoCAD route receives a UUID / code and
  // the two can drift on case.
  const needle = intersectionKey.toLowerCase();
  for (const [key, config] of Object.entries(snapshot.intersections)) {
    if (key.toLowerCase() === needle) return config;
  }
  return null;
}

/**
 * Subscribe to store updates — both cross-tab (`storage` event) and
 * same-tab (custom event dispatched by `writeCivilPlan` below).
 * Returns the cleanup function.
 */
export function subscribeToStudioStore(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const storageHandler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  const customHandler = () => listener();
  window.addEventListener("storage", storageHandler);
  window.addEventListener(SAME_TAB_EVENT, customHandler);
  return () => {
    window.removeEventListener("storage", storageHandler);
    window.removeEventListener(SAME_TAB_EVENT, customHandler);
  };
}

/**
 * Write a `CivilPlan` into the studio store for a given intersection.
 * Used by the AutoCAD page's "Import OSM" button to apply real
 * geometry without making the operator hop to the Workbench wizard.
 *
 * Creates a minimal IntersectionConfig if one isn't already in the
 * store (the Workbench will fill in the rest when the operator opens
 * the intersection there).
 */
export function writeCivilPlan(
  intersectionKey: string,
  identity: {
    name: string;
    district?: string;
    address?: string;
    location?: { lat: number; lng: number };
  },
  plan: CivilPlan,
): void {
  if (typeof window === "undefined") return;
  const snapshot: StudioStoreSnapshot = readStudioStore() ?? {
    version: 1,
    intersections: {},
  };
  const existing = readIntersectionConfig(intersectionKey);
  // Preserve the key under which it was originally stored so we don't
  // create a duplicate when the key casing differs.
  const storeKey =
    existing && Object.keys(snapshot.intersections).find(
      (k) => k.toLowerCase() === intersectionKey.toLowerCase(),
    )
      ? Object.keys(snapshot.intersections).find(
          (k) => k.toLowerCase() === intersectionKey.toLowerCase(),
        )!
      : intersectionKey;
  const next: IntersectionConfig = existing
    ? { ...existing, civilPlan: plan }
    : {
        id: intersectionKey,
        identity: {
          name: identity.name,
          district: identity.district ?? "",
          address: identity.address ?? "",
          location: identity.location ?? { lat: 0, lng: 0 },
        },
        controllerId: "",
        approaches: [],
        signalGroups: [],
        detectors: [],
        phases: [],
        stages: [],
        conflicts: [],
        civilPlan: plan,
        workflowStatus: "draft_plan",
        revision: "A",
      };
  snapshot.intersections[storeKey] = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new Event(SAME_TAB_EVENT));
  } catch {
    /* quota / serialization error — silently ignore */
  }
}
