/**
 * OpenStreetMap → CivilPlan base-layer importer.
 *
 * Queries the Overpass API for every road geometry within a small radius
 * of an intersection's GPS, projects each node to local plan-frame
 * metres (origin = the intersection centre), classifies the way as a
 * roundabout / road / lane edge, and returns a list of `BaseLayerFeature`
 * ready to slot into `CivilPlan.baseLayers`.
 *
 * The renderer already draws `baseLayers` under the engineering layers
 * (see `BaseLayersGroup` in civil-plan-renderer.tsx), so once this lib
 * fills them in the AutoCAD page reflects the real road geometry instead
 * of the hash-derived template.
 */

import type {
  BaseLayerFeature,
  BaseLayerKind,
  PlanPoint,
} from "@/types/civil-plan";

/** Public Overpass instance.  Anonymous, ~1 req/s soft limit. */
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
/** Backup mirrors used when the primary returns 5xx / fails.  Public,
 *  community-run; tried in order. */
const OVERPASS_MIRRORS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/** Highway tag values we keep — anything else (footway, path, cycleway,
 *  service driveways) is dropped to avoid noise in the engineering view. */
const KEEP_HIGHWAYS = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "unclassified",
  "living_street",
]);

/** Per-category lane defaults when OSM doesn't tag `lanes=`.  Each lane
 *  is conventionally 3.0–3.5 m wide. */
const DEFAULT_LANES: Record<string, number> = {
  motorway: 6,
  motorway_link: 2,
  trunk: 6,
  trunk_link: 2,
  primary: 4,
  primary_link: 2,
  secondary: 4,
  secondary_link: 2,
  tertiary: 3,
  tertiary_link: 2,
  residential: 2,
  unclassified: 2,
  living_street: 2,
};

const LANE_WIDTH_METRES = 3.2;

function carriagewayWidth(tags: Record<string, string>): number {
  // 1) Explicit `width=` (Overpass returns it as a string, sometimes
  //    with units like "12 m").
  if (tags.width) {
    const m = parseFloat(tags.width.replace(",", "."));
    if (Number.isFinite(m) && m > 0) return Math.min(60, m);
  }
  // 2) `lanes=N` count × lane width.
  if (tags.lanes) {
    const n = parseInt(tags.lanes, 10);
    if (Number.isFinite(n) && n > 0) return n * LANE_WIDTH_METRES;
  }
  // 3) Fallback per highway category.
  const lanes = DEFAULT_LANES[tags.highway ?? ""] ?? 2;
  return lanes * LANE_WIDTH_METRES;
}

interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}
interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
type OsmElement = OsmNode | OsmWay;

interface OverpassResponse {
  elements?: OsmElement[];
}

export interface OsmImportResult {
  features: BaseLayerFeature[];
  /** Number of OSM ways considered before filtering. */
  rawWays: number;
  /** Number of ways that produced features. */
  keptWays: number;
  /** Names of streets detected (for sanity-check / future labelling). */
  streetNames: string[];
  /** True if at least one way had `junction=roundabout`. */
  hasRoundabout: boolean;
  /** Bounds of the imported geometry in metres, for fitting the viewBox. */
  metresBounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface OsmImportOptions {
  /** Overpass search radius in metres — how far out to look for ways. */
  radiusMetres?: number;
  /** Clip radius in metres — anything outside this is discarded so the
   *  AutoCAD canvas stays focused on the intersection itself, not the
   *  long approaches stretching past it.  Defaults to `radiusMetres`. */
  clipRadiusMetres?: number;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Override the Overpass endpoint (e.g. mirror in restricted networks). */
  endpoint?: string;
}

/**
 * Fetch real road geometry around `(lat, lng)` from OpenStreetMap and
 * convert it to local-frame metres.
 */
export async function fetchOsmBaseLayers(
  lat: number,
  lng: number,
  options: OsmImportOptions = {},
): Promise<OsmImportResult> {
  const radius = Math.max(20, Math.min(300, options.radiusMetres ?? 90));
  const clipRadius = Math.max(
    20,
    Math.min(radius, options.clipRadiusMetres ?? radius),
  );
  const endpoints = options.endpoint
    ? [options.endpoint]
    : [OVERPASS_ENDPOINT, ...OVERPASS_MIRRORS];

  const query = `
    [out:json][timeout:25];
    (
      way(around:${radius},${lat},${lng})[highway];
    );
    (._;>;);
    out body;
  `.trim();

  let lastError: unknown = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass rejects requests without a User-Agent (HTTP 406).
          // Browsers silently override this header (it's a forbidden header
          // in the Fetch spec) so this only matters in non-browser runtimes.
          "User-Agent": "STLS-AutoCAD/1.0 (Civil Plan importer)",
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: options.signal,
      });
      // 5xx → mirror is overloaded, try the next one.  4xx is a bug
      // and shouldn't be retried.
      if (response.status >= 500) {
        lastError = new Error(
          `Overpass mirror ${endpoint} returned ${response.status}`,
        );
        continue;
      }
      if (!response.ok) {
        throw new Error(
          `Overpass returned ${response.status} ${response.statusText}`,
        );
      }
      const payload = (await response.json()) as OverpassResponse;
      return parseOsmResponse(payload, lat, lng, clipRadius);
    } catch (err) {
      // AbortError must propagate immediately — the user cancelled.
      if ((err as { name?: string })?.name === "AbortError") throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Overpass: all mirrors failed");
}

/**
 * Pure-data parser — exposed so tests can feed canned Overpass JSON.
 */
export function parseOsmResponse(
  payload: OverpassResponse,
  centreLat: number,
  centreLng: number,
  clipRadiusMetres = Infinity,
): OsmImportResult {
  const elements = payload.elements ?? [];
  const nodeIndex = new Map<number, OsmNode>();
  const ways: OsmWay[] = [];
  for (const el of elements) {
    if (el.type === "node") {
      nodeIndex.set(el.id, el);
    } else if (el.type === "way") {
      ways.push(el);
    }
  }

  // Local equirectangular projection — accurate to <0.1% over <500 m.
  const metresPerDegLat = 111_320;
  const metresPerDegLng = 111_320 * Math.cos((centreLat * Math.PI) / 180);
  const project = (lat: number, lng: number): PlanPoint => ({
    x: (lng - centreLng) * metresPerDegLng,
    y: (lat - centreLat) * metresPerDegLat,
  });

  const features: BaseLayerFeature[] = [];
  const streetNames = new Set<string>();
  let hasRoundabout = false;
  let kept = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const way of ways) {
    const tags = way.tags ?? {};
    const highway = tags.highway;
    if (!highway || !KEEP_HIGHWAYS.has(highway)) continue;

    const rawPath: PlanPoint[] = [];
    for (const nid of way.nodes) {
      const node = nodeIndex.get(nid);
      if (!node) continue;
      rawPath.push(project(node.lat, node.lon));
    }
    if (rawPath.length < 2) continue;

    const isRoundabout =
      tags.junction === "roundabout" || tags.junction === "circular";

    // Roundabouts are kept whole even if some nodes sit just past the
    // clip radius — the shape only reads as a roundabout when closed.
    const segments = isRoundabout
      ? [rawPath]
      : clipPolylineToCircle(rawPath, clipRadiusMetres);

    for (const path of segments) {
      if (path.length < 2) continue;
      for (const p of path) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }

      if (isRoundabout) hasRoundabout = true;
      if (tags.name) streetNames.add(tags.name);

      const closed =
        isRoundabout ||
        (path.length > 2 &&
          path[0].x === path[path.length - 1].x &&
          path[0].y === path[path.length - 1].y);

      features.push({
        id: `osm-${way.id}-${features.length}`,
        kind: "roads",
        path,
        closed,
        label: tags.name ?? tags.ref,
        width: carriagewayWidth(tags),
        category: highway,
        roundabout: isRoundabout || undefined,
      });
      kept += 1;

      if (isRoundabout && path.length >= 4) {
        const centroid = polygonCentroid(path);
        const radius = averageRadius(path, centroid) * 0.55;
        if (radius > 1.5) {
          const islandPath: PlanPoint[] = [];
          const segCount = 24;
          for (let i = 0; i <= segCount; i += 1) {
            const t = (i / segCount) * Math.PI * 2;
            islandPath.push({
              x: centroid.x + Math.cos(t) * radius,
              y: centroid.y + Math.sin(t) * radius,
            });
          }
          features.push({
            id: `osm-${way.id}-island`,
            kind: "medians",
            path: islandPath,
            closed: true,
            label: tags.name ? `${tags.name} (îlot central)` : "Îlot central",
          });
        }
      }
    }
  }

  const metresBounds =
    isFinite(minX) && isFinite(maxX)
      ? { minX, minY, maxX, maxY }
      : undefined;

  return {
    features,
    rawWays: ways.length,
    keptWays: kept,
    streetNames: Array.from(streetNames).sort(),
    hasRoundabout,
    metresBounds,
  };
}

/**
 * Clip a polyline against a circle centered at the origin.
 *
 * Walks the polyline, keeping the in-circle portions and snapping the
 * boundary crossings to the intersection point.  A polyline that
 * enters and exits the circle multiple times yields multiple output
 * segments.
 */
function clipPolylineToCircle(
  points: PlanPoint[],
  radius: number,
): PlanPoint[][] {
  if (!isFinite(radius)) return [points];
  const r2 = radius * radius;
  const segments: PlanPoint[][] = [];
  let current: PlanPoint[] = [];
  const insideR = (p: PlanPoint) => p.x * p.x + p.y * p.y <= r2;
  // Solve for the parametric t in [0,1] where segment (a→b) crosses
  // the circle x²+y² = r².
  const intersect = (a: PlanPoint, b: PlanPoint): PlanPoint | null => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const A = dx * dx + dy * dy;
    if (A === 0) return null;
    const B = 2 * (a.x * dx + a.y * dy);
    const C = a.x * a.x + a.y * a.y - r2;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    // Pick the root inside [0,1] — closest to a if a is inside, etc.
    const t1 = (-B - sq) / (2 * A);
    const t2 = (-B + sq) / (2 * A);
    const candidates = [t1, t2].filter((t) => t >= 0 && t <= 1).sort();
    if (candidates.length === 0) return null;
    // Pick the root that gives a transition (one end inside, other out)
    // or the entry point if both ends are outside.
    const aIn = insideR(a);
    const bIn = insideR(b);
    let t: number;
    if (aIn && !bIn) t = candidates[candidates.length - 1];
    else if (!aIn && bIn) t = candidates[0];
    else t = candidates[0];
    return { x: a.x + dx * t, y: a.y + dy * t };
  };

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const inside = insideR(p);
    const prev = i > 0 ? points[i - 1] : null;
    if (inside) {
      if (prev && !insideR(prev)) {
        // Just entered — push the boundary crossing first.
        const hit = intersect(prev, p);
        if (hit) current.push(hit);
      }
      current.push(p);
    } else if (prev && insideR(prev)) {
      // Just left — push the boundary crossing as the segment's last point.
      const hit = intersect(prev, p);
      if (hit) current.push(hit);
      if (current.length >= 2) segments.push(current);
      current = [];
    } else if (prev) {
      // Both ends outside — may still cross the circle in the middle.
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const A = dx * dx + dy * dy;
      if (A === 0) continue;
      const B = 2 * (prev.x * dx + prev.y * dy);
      const C = prev.x * prev.x + prev.y * prev.y - r2;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-B - sq) / (2 * A);
        const t2 = (-B + sq) / (2 * A);
        if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
          const enter = { x: prev.x + dx * t1, y: prev.y + dy * t1 };
          const exit = { x: prev.x + dx * t2, y: prev.y + dy * t2 };
          segments.push([enter, exit]);
        }
      }
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function polygonCentroid(points: PlanPoint[]): PlanPoint {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function averageRadius(points: PlanPoint[], centre: PlanPoint): number {
  let total = 0;
  for (const p of points) {
    total += Math.hypot(p.x - centre.x, p.y - centre.y);
  }
  return total / points.length;
}
