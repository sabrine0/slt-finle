/**
 * OSM Overpass client — fetches real road geometry around an
 * intersection point so the AI engineering study can reason on
 * actual road classes, lane counts, skew angles and nearby POIs.
 *
 * Public Overpass instances rate-limit aggressively. We use a short
 * query, accept cached responses, and gracefully degrade (returns
 * null) when the network or data is unavailable — the analyzer
 * falls back to synthesised geometry in that case.
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const SEARCH_RADIUS_METERS = 60;
const POI_RADIUS_METERS = 200;

export type ApproachBearing =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW";

export interface ObservedApproach {
  bearing: ApproachBearing;
  bearingDegrees: number;
  highwayClass: string;
  laneCount: number;
  widthMeters: number;
  oneWay: boolean;
  name?: string;
  speedKph?: number;
}

export interface ObservedCrossing {
  type: "marked" | "signalised" | "refuge" | "zebra";
  approachBearing: ApproachBearing;
  widthMeters: number;
}

export interface ObservedTramLine {
  axisBearing: ApproachBearing;
  name?: string;
}

export interface ObservedPoi {
  kind:
    | "school"
    | "mosque"
    | "church"
    | "hospital"
    | "market"
    | "station"
    | "park"
    | "shopping"
    | "other";
  name?: string;
  distanceMeters: number;
}

export interface ObservedLandUse {
  kind:
    | "residential"
    | "commercial"
    | "industrial"
    | "retail"
    | "education"
    | "institutional"
    | "park"
    | "farmland"
    | "other";
  distanceMeters: number;
}

export interface ObservedGeometry {
  approaches: ObservedApproach[];
  pedestrianCrossings: ObservedCrossing[];
  tramLines: ObservedTramLine[];
  nearbyPoi: ObservedPoi[];
  landUses: ObservedLandUse[];
  nearestSignalDistanceMeters?: number;
  hasRoundabout: boolean;
  source: string;
}

interface OverpassElement {
  type: "node" | "way";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Build the Overpass QL query for the area around (lat, lng).
 * Asks for :
 *   - highway ways (roads)
 *   - tram + light_rail
 *   - signalised + zebra crossings
 *   - traffic_signal nodes (to estimate corridor distance)
 *   - POIs that drive pedestrian exposure
 */
function buildQuery(lat: number, lng: number): string {
  return [
    "[out:json][timeout:15];",
    "(",
    `  way["highway"](around:${SEARCH_RADIUS_METERS},${lat},${lng});`,
    `  way["junction"="roundabout"](around:${SEARCH_RADIUS_METERS * 2},${lat},${lng});`,
    `  way["railway"="tram"](around:${SEARCH_RADIUS_METERS * 4},${lat},${lng});`,
    `  way["railway"="light_rail"](around:${SEARCH_RADIUS_METERS * 4},${lat},${lng});`,
    `  node["highway"="crossing"](around:${SEARCH_RADIUS_METERS * 2},${lat},${lng});`,
    `  node["highway"="traffic_signals"](around:${SEARCH_RADIUS_METERS * 8},${lat},${lng});`,
    `  node["amenity"~"^(school|university|college|kindergarten|hospital|marketplace|place_of_worship|theatre|cinema)$"](around:${POI_RADIUS_METERS},${lat},${lng});`,
    `  node["shop"](around:${POI_RADIUS_METERS},${lat},${lng});`,
    `  node["railway"~"^(station|tram_stop|halt)$"](around:${POI_RADIUS_METERS},${lat},${lng});`,
    // Land use polygons (for map context : residential / commercial / industrial)
    `  way["landuse"](around:${POI_RADIUS_METERS},${lat},${lng});`,
    `  relation["landuse"](around:${POI_RADIUS_METERS},${lat},${lng});`,
    ");",
    "out geom tags;",
  ].join("\n");
}

/**
 * Fetch OSM geometry around the point. Returns null on any failure
 * (network, parse, empty result) so the backend analyzer can fall
 * back to its synthesised baseline.
 */
export async function fetchOsmGeometry(
  latitude: number,
  longitude: number,
): Promise<ObservedGeometry | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  try {
    const body = `data=${encodeURIComponent(buildQuery(latitude, longitude))}`;
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as OverpassResponse;
    return parseOverpass(json, latitude, longitude);
  } catch {
    return null;
  }
}

function parseOverpass(
  response: OverpassResponse,
  centerLat: number,
  centerLng: number,
): ObservedGeometry | null {
  const ways = response.elements.filter(
    (e) => e.type === "way" && e.geometry && e.geometry.length >= 2,
  );
  const nodes = response.elements.filter((e) => e.type === "node");

  const approachWays = ways.filter((w) => w.tags?.highway);
  const tramWays = ways.filter(
    (w) =>
      w.tags?.railway === "tram" || w.tags?.railway === "light_rail",
  );
  const landUseWays = ways.filter((w) => w.tags?.landuse);
  const hasRoundabout = approachWays.some(
    (w) => w.tags?.junction === "roundabout",
  );

  // --- Approaches : for each highway way, compute the bearing
  // closest to the intersection node. ---
  const approaches: ObservedApproach[] = [];
  const seenBearings = new Set<ApproachBearing>();
  for (const way of approachWays) {
    const tags = way.tags ?? {};
    const geom = way.geometry ?? [];
    // Find the endpoint nearest the intersection (within radius).
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < geom.length; i += 1) {
      const d = haversineMeters(
        centerLat,
        centerLng,
        geom[i].lat,
        geom[i].lon,
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    if (nearestDist > SEARCH_RADIUS_METERS + 5) continue;
    // The "outgoing" point is the next geometry node away from the
    // intersection (~30m typically).
    const farIdx =
      nearestIdx === 0 ? Math.min(geom.length - 1, 2) : Math.max(0, nearestIdx - 2);
    const bearingDeg = bearingDegrees(
      centerLat,
      centerLng,
      geom[farIdx].lat,
      geom[farIdx].lon,
    );
    const cardinalBearing = degToBearing(bearingDeg);
    // Dedupe — keep only one approach per cardinal direction (highest highway class wins).
    if (seenBearings.has(cardinalBearing)) {
      const existingIdx = approaches.findIndex(
        (a) => a.bearing === cardinalBearing,
      );
      const existing = approaches[existingIdx];
      const newWeight = highwayWeight(tags.highway ?? "unclassified");
      const existingWeight = highwayWeight(existing.highwayClass);
      if (newWeight <= existingWeight) continue;
      approaches.splice(existingIdx, 1);
    }
    seenBearings.add(cardinalBearing);
    approaches.push({
      bearing: cardinalBearing,
      bearingDegrees: bearingDeg,
      highwayClass: tags.highway ?? "unclassified",
      laneCount: parseLanes(tags.lanes) ?? defaultLanes(tags.highway),
      widthMeters: parseWidth(tags.width) ?? defaultWidth(tags.highway),
      oneWay: tags.oneway === "yes",
      name: tags.name,
      speedKph: parseSpeed(tags.maxspeed),
    });
  }

  // --- Pedestrian crossings ---
  const crossings: ObservedCrossing[] = nodes
    .filter((n) => n.tags?.highway === "crossing")
    .map((n) => {
      const bearing =
        n.lat != null && n.lon != null
          ? degToBearing(
              bearingDegrees(centerLat, centerLng, n.lat, n.lon),
            )
          : "N";
      const dominantApproach = approaches.find((a) => a.bearing === bearing);
      return {
        type:
          (n.tags?.crossing as ObservedCrossing["type"]) ?? "marked",
        approachBearing: bearing,
        widthMeters: dominantApproach?.widthMeters ?? 7,
      };
    });

  // --- Tram lines ---
  const tramLines: ObservedTramLine[] = tramWays.slice(0, 2).map((w) => {
    const geom = w.geometry ?? [];
    const bearingDeg =
      geom.length >= 2
        ? bearingDegrees(geom[0].lat, geom[0].lon, geom[1].lat, geom[1].lon)
        : 90;
    return {
      axisBearing: degToBearing(bearingDeg),
      name: w.tags?.name,
    };
  });

  // --- POIs ---
  const poiNodes = nodes.filter(
    (n) =>
      n.tags?.amenity ||
      n.tags?.shop ||
      n.tags?.railway === "station" ||
      n.tags?.railway === "tram_stop" ||
      n.tags?.railway === "halt",
  );
  const nearbyPoi: ObservedPoi[] = poiNodes.slice(0, 12).map((n) => {
    const distance =
      n.lat != null && n.lon != null
        ? haversineMeters(centerLat, centerLng, n.lat, n.lon)
        : POI_RADIUS_METERS;
    return {
      kind: poiKind(n.tags),
      name: n.tags?.name,
      distanceMeters: Math.round(distance),
    };
  });

  // --- Nearest neighbouring signal (corridor coordination hint) ---
  let nearestSignalDistanceMeters: number | undefined;
  for (const n of nodes) {
    if (n.tags?.highway !== "traffic_signals") continue;
    if (n.lat == null || n.lon == null) continue;
    const d = haversineMeters(centerLat, centerLng, n.lat, n.lon);
    if (d < 5) continue; // the carrefour itself
    if (!nearestSignalDistanceMeters || d < nearestSignalDistanceMeters) {
      nearestSignalDistanceMeters = d;
    }
  }

  if (approaches.length === 0) return null;

  // --- Land use polygons → simplified centroid distance ---
  const landUses: ObservedLandUse[] = [];
  for (const way of landUseWays.slice(0, 20)) {
    if (!way.geometry || way.geometry.length === 0) continue;
    // Centroid (approximate — mean of way nodes)
    let sumLat = 0;
    let sumLon = 0;
    for (const pt of way.geometry) {
      sumLat += pt.lat;
      sumLon += pt.lon;
    }
    const cLat = sumLat / way.geometry.length;
    const cLon = sumLon / way.geometry.length;
    const distance = haversineMeters(centerLat, centerLng, cLat, cLon);
    if (distance > POI_RADIUS_METERS) continue;
    landUses.push({
      kind: normaliseLandUse(way.tags?.landuse),
      distanceMeters: Math.round(distance),
    });
  }

  return {
    approaches,
    pedestrianCrossings: crossings,
    tramLines,
    nearbyPoi,
    landUses,
    nearestSignalDistanceMeters,
    hasRoundabout,
    source: "OSM Overpass",
  };
}

function normaliseLandUse(value: string | undefined): ObservedLandUse["kind"] {
  if (!value) return "other";
  if (value === "residential") return "residential";
  if (value === "commercial") return "commercial";
  if (value === "industrial") return "industrial";
  if (value === "retail") return "retail";
  if (value === "education") return "education";
  if (value === "institutional" || value === "religious")
    return "institutional";
  if (value === "park" || value === "recreation_ground" || value === "grass")
    return "park";
  if (value === "farmland" || value === "farmyard" || value === "meadow")
    return "farmland";
  return "other";
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function degToBearing(deg: number): ApproachBearing {
  const normalised = ((deg % 360) + 360) % 360;
  const buckets: Array<{ name: ApproachBearing; center: number }> = [
    { name: "N", center: 0 },
    { name: "NE", center: 45 },
    { name: "E", center: 90 },
    { name: "SE", center: 135 },
    { name: "S", center: 180 },
    { name: "SW", center: 225 },
    { name: "W", center: 270 },
    { name: "NW", center: 315 },
  ];
  let best: ApproachBearing = "N";
  let bestDiff = Infinity;
  for (const bucket of buckets) {
    let diff = Math.abs(normalised - bucket.center);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = bucket.name;
    }
  }
  return best;
}

function parseLanes(tag: string | undefined): number | undefined {
  if (!tag) return undefined;
  const n = parseInt(tag, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseWidth(tag: string | undefined): number | undefined {
  if (!tag) return undefined;
  const match = /^(\d+(?:\.\d+)?)/.exec(tag);
  if (!match) return undefined;
  return parseFloat(match[1]);
}

function parseSpeed(tag: string | undefined): number | undefined {
  if (!tag) return undefined;
  const match = /^(\d+)/.exec(tag);
  return match ? parseInt(match[1], 10) : undefined;
}

function defaultLanes(klass: string | undefined): number {
  switch (klass) {
    case "motorway":
    case "trunk":
      return 3;
    case "primary":
      return 2;
    case "secondary":
      return 2;
    case "tertiary":
      return 1;
    default:
      return 1;
  }
}

function defaultWidth(klass: string | undefined): number {
  switch (klass) {
    case "motorway":
    case "trunk":
      return 14;
    case "primary":
      return 10.5;
    case "secondary":
      return 8;
    case "tertiary":
      return 7;
    default:
      return 5;
  }
}

function highwayWeight(klass: string): number {
  switch (klass) {
    case "motorway":
    case "trunk":
      return 10;
    case "primary":
      return 7;
    case "secondary":
      return 5;
    case "tertiary":
      return 3;
    case "residential":
    case "unclassified":
      return 2;
    default:
      return 1;
  }
}

function poiKind(tags: Record<string, string> | undefined): ObservedPoi["kind"] {
  if (!tags) return "other";
  if (tags.railway === "station" || tags.railway === "tram_stop" || tags.railway === "halt")
    return "station";
  const amenity = tags.amenity;
  if (amenity === "school" || amenity === "university" || amenity === "college" || amenity === "kindergarten")
    return "school";
  if (amenity === "place_of_worship") {
    if (tags.religion === "muslim") return "mosque";
    if (tags.religion === "christian") return "church";
    return "other";
  }
  if (amenity === "hospital") return "hospital";
  if (amenity === "marketplace") return "market";
  if (tags.shop) return "shopping";
  if (amenity === "theatre" || amenity === "cinema") return "shopping";
  return "other";
}
