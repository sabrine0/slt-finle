/**
 * Local carrefour network — map-created intersections and the explicit
 * links between them.  These live alongside (not instead of) the
 * backend engineering intersections so the Studio explorer can show a
 * merged view, and the corridor / dossier / programmer flows can work
 * on carrefours that have not yet made it to the backend.
 */

export type MapCarrefourSource = "map";

export interface MapCarrefour {
  id: string; // e.g. "MAPC-ab12cd"
  code: string;
  name: string;
  /** Closest city name (resolved at creation time, cached for display). */
  city?: string | null;
  /** Closest region id from moroccoGeography (so the tree can slot it). */
  regionId?: string | null;
  /** Nearest city id from moroccoGeography. */
  cityId?: string | null;
  district?: string | null;
  address?: string | null;
  location: { lat: number; lng: number };
  source: MapCarrefourSource;
  createdAt: string; // ISO 8601
  updatedAt?: string;
  /** Optional free-form notes from the operator. */
  notes?: string;
}

export type IntersectionLinkKind = "road" | "corridor" | "suggested";

export interface IntersectionLink {
  id: string;
  fromIntersectionId: string;
  toIntersectionId: string;
  kind: IntersectionLinkKind;
  /** Optional polyline path in lat/lng.  When absent, renderers draw a
   *  straight segment between the two endpoints. */
  path?: Array<{ lat: number; lng: number }>;
  distanceMetres: number;
  /** Degrees clockwise from north at the FROM side. */
  bearingDeg: number;
  /** Optional travel time — populated by later auto-routing / manual
   *  data entry. */
  travelTimeSeconds?: number;
  createdAt: string;
  createdBy?: string;
  notes?: string;
}

export interface NetworkStoreState {
  version: 1;
  carrefours: MapCarrefour[];
  links: IntersectionLink[];
}
