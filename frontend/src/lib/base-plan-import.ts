/**
 * Base-plan importers — convert real-world topographic / vector base
 * data (SVG, GeoJSON, DXF) into the STLS plan frame (metres, local
 * origin = intersection centre, +X east / +Y north).
 *
 * The user story:
 *   1. operator locates the intersection on Google Map, picks a
 *      centre + map zoom + extent rectangle + rotation
 *   2. operator exports the same place out of TopoExport (or any CAD
 *      software) as SVG / DXF / GeoJSON and uploads it here
 *   3. we parse geometry into `BaseLayerFeature[]` in metres, anchored
 *      on the map centre and rotated so the plan frame is north-up
 *
 * Everything is intentionally small and dependency-free — we don't
 * pull a heavy DXF lib, we just parse the subset of entities we need
 * (LINE + LWPOLYLINE).  Anything we can't parse is surfaced as a
 * warning, not a crash.
 */

import type {
  BaseLayerFeature,
  BaseLayerKind,
  BasePlanFileMeta,
  BasePlanSource,
  PlanPoint,
} from "@/types/civil-plan";

const METRES_PER_LAT_DEGREE = 111_320;

export interface ImportContext {
  mapCenter: { lat: number; lng: number };
  /** Rotation of the plan frame relative to geographic north.  The
   *  importer subtracts this so the resulting plan points are in a
   *  north-up frame when rotation is 0. */
  rotationRadians: number;
  /** Declared as TopoExport or a raw format.  Used for metadata only. */
  declaredSource?: BasePlanSource;
}

export interface ImportedBasePlan {
  features: BaseLayerFeature[];
  fileMeta: BasePlanFileMeta;
  source: BasePlanSource;
  warnings: string[];
}

/** Routes a file to the right parser based on name + mime. */
export async function parseBasePlanFile(
  file: File,
  ctx: ImportContext,
): Promise<ImportedBasePlan> {
  const name = file.name.toLowerCase();
  const text = await file.text();
  const sizeBytes = file.size;

  if (name.endsWith(".svg") || file.type.includes("svg")) {
    return parseSvg(text, file, sizeBytes, ctx);
  }
  if (
    name.endsWith(".geojson") ||
    name.endsWith(".json") ||
    file.type.includes("geo+json") ||
    file.type.includes("json")
  ) {
    return parseGeoJson(text, file, sizeBytes, ctx);
  }
  if (name.endsWith(".dxf") || file.type.includes("dxf")) {
    return parseDxf(text, file, sizeBytes, ctx);
  }

  throw new Error(
    `Unsupported base-plan file "${file.name}". Use SVG, DXF or GeoJSON.`,
  );
}

// ───────────────────────── SVG ─────────────────────────
//
// SVG coordinates are treated as metres-in-svg-user-units (1 unit =
// 1 metre).  The viewBox centre is mapped to the plan origin.  Y is
// flipped because SVG grows downward.

function parseSvg(
  text: string,
  file: File,
  sizeBytes: number,
  ctx: ImportContext,
): ImportedBasePlan {
  const warnings: string[] = [];
  if (typeof DOMParser === "undefined") {
    throw new Error("SVG parsing requires a browser environment.");
  }
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("SVG file is malformed and could not be parsed.");
  }
  const svg = doc.documentElement;
  const viewBox = readSvgViewBox(svg) ?? { x: 0, y: 0, w: 100, h: 100 };
  const cx = viewBox.x + viewBox.w / 2;
  const cy = viewBox.y + viewBox.h / 2;

  const toPlanPoint = (x: number, y: number): PlanPoint => {
    const dx = x - cx;
    const dy = y - cy;
    // Flip Y so north is up in our frame.
    return rotatePoint({ x: dx, y: -dy }, -ctx.rotationRadians);
  };

  const features: BaseLayerFeature[] = [];

  const classifyNode = (el: Element): BaseLayerKind => {
    const cls = (el.getAttribute("class") ?? "").toLowerCase();
    const layer = (el.getAttribute("data-layer") ?? "").toLowerCase();
    const merged = `${cls} ${layer}`;
    if (/crosswalk|traversée|passage/.test(merged)) return "crosswalks";
    if (/median|terre-?plein|refuge/.test(merged)) return "medians";
    if (/building|bâti|batiment/.test(merged)) return "buildings";
    if (/parcel|parcelle|property/.test(merged)) return "parcels";
    if (/contour|elevation|hauteur/.test(merged)) return "contours";
    if (/lane|voie/.test(merged)) return "lane_edges";
    return "roads";
  };

  let idCounter = 0;
  const pushFeature = (
    kind: BaseLayerKind,
    path: PlanPoint[],
    closed: boolean,
    label?: string,
  ) => {
    if (path.length < 2) return;
    features.push({
      id: `svg-${idCounter++}`,
      kind,
      path,
      closed,
      label,
    });
  };

  doc.querySelectorAll("polyline,polygon").forEach((el) => {
    const raw = el.getAttribute("points");
    if (!raw) return;
    const pts = raw
      .trim()
      .split(/\s+|,/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    const path: PlanPoint[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      path.push(toPlanPoint(pts[i]!, pts[i + 1]!));
    }
    pushFeature(classifyNode(el), path, el.tagName.toLowerCase() === "polygon");
  });

  doc.querySelectorAll("line").forEach((el) => {
    const x1 = Number(el.getAttribute("x1"));
    const y1 = Number(el.getAttribute("y1"));
    const x2 = Number(el.getAttribute("x2"));
    const y2 = Number(el.getAttribute("y2"));
    if (![x1, y1, x2, y2].every(Number.isFinite)) return;
    pushFeature(
      classifyNode(el),
      [toPlanPoint(x1, y1), toPlanPoint(x2, y2)],
      false,
    );
  });

  doc.querySelectorAll("path").forEach((el) => {
    const d = el.getAttribute("d");
    if (!d) return;
    const sub = extractPathSubpaths(d);
    for (const subpath of sub) {
      const path = subpath.points.map((pt) => toPlanPoint(pt.x, pt.y));
      pushFeature(classifyNode(el), path, subpath.closed);
    }
  });

  if (features.length === 0) {
    warnings.push(
      "No <path>/<polyline>/<polygon>/<line> elements found in the SVG — nothing to import.",
    );
  }

  return {
    features,
    fileMeta: {
      name: file.name,
      sizeBytes,
      mime: file.type || "image/svg+xml",
      featureCount: features.length,
    },
    source: ctx.declaredSource ?? "svg",
    warnings,
  };
}

function readSvgViewBox(
  svg: Element,
): { x: number; y: number; w: number; h: number } | null {
  const vb = svg.getAttribute("viewBox");
  if (vb) {
    const parts = vb
      .split(/\s+|,/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (parts.length === 4) {
      return { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! };
    }
  }
  const w = Number(svg.getAttribute("width"));
  const h = Number(svg.getAttribute("height"));
  if (Number.isFinite(w) && Number.isFinite(h)) {
    return { x: 0, y: 0, w, h };
  }
  return null;
}

/**
 * Very small SVG path-d tokenizer.  Handles M/L/H/V/Z (and lowercase
 * equivalents) and approximates curves by their control points — that
 * is enough to land road centrelines / lane edges / crosswalk strips
 * coming out of TopoExport.  More exotic commands are ignored with a
 * warning at the parser level.
 */
function extractPathSubpaths(
  d: string,
): Array<{ points: Array<{ x: number; y: number }>; closed: boolean }> {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Array<{
    points: Array<{ x: number; y: number }>;
    closed: boolean;
  }> = [];
  let current: Array<{ x: number; y: number }> = [];
  let cursor: { x: number; y: number } = { x: 0, y: 0 };
  let start: { x: number; y: number } = { x: 0, y: 0 };
  let command = "M";
  let i = 0;
  const takeNumber = () => Number(tokens[i++]);

  const openSub = () => {
    if (current.length > 0) {
      out.push({ points: current, closed: false });
    }
    current = [];
  };
  const closeSub = () => {
    if (current.length > 0) {
      current.push({ ...start });
      out.push({ points: current, closed: true });
      current = [];
    }
  };

  while (i < tokens.length) {
    const token = tokens[i]!;
    if (/^[A-Za-z]$/.test(token)) {
      command = token;
      i++;
      if (command === "Z" || command === "z") {
        closeSub();
        cursor = { ...start };
      }
      continue;
    }

    switch (command) {
      case "M":
      case "m": {
        openSub();
        const x = takeNumber();
        const y = takeNumber();
        cursor = command === "m" ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        start = { ...cursor };
        current.push({ ...cursor });
        command = command === "M" ? "L" : "l"; // implicit lineto
        break;
      }
      case "L":
      case "l": {
        const x = takeNumber();
        const y = takeNumber();
        cursor = command === "l" ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        current.push({ ...cursor });
        break;
      }
      case "H":
      case "h": {
        const x = takeNumber();
        cursor = command === "h" ? { x: cursor.x + x, y: cursor.y } : { x, y: cursor.y };
        current.push({ ...cursor });
        break;
      }
      case "V":
      case "v": {
        const y = takeNumber();
        cursor = command === "v" ? { x: cursor.x, y: cursor.y + y } : { x: cursor.x, y };
        current.push({ ...cursor });
        break;
      }
      // For curves we just take the endpoint — good enough for
      // centrelines / lane edges; detail is preserved-ish by the
      // source data already being polylinified.
      case "C":
      case "c": {
        takeNumber();
        takeNumber();
        takeNumber();
        takeNumber();
        const x = takeNumber();
        const y = takeNumber();
        cursor = command === "c" ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        current.push({ ...cursor });
        break;
      }
      case "Q":
      case "q": {
        takeNumber();
        takeNumber();
        const x = takeNumber();
        const y = takeNumber();
        cursor = command === "q" ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        current.push({ ...cursor });
        break;
      }
      case "S":
      case "s": {
        // control2 x/y, then endpoint x/y
        takeNumber();
        takeNumber();
        const x = takeNumber();
        const y = takeNumber();
        cursor = command === "s" ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        current.push({ ...cursor });
        break;
      }
      case "T":
      case "t": {
        const x = takeNumber();
        const y = takeNumber();
        cursor = command === "t" ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        current.push({ ...cursor });
        break;
      }
      case "A":
      case "a": {
        takeNumber();
        takeNumber();
        takeNumber();
        takeNumber();
        takeNumber();
        const x = takeNumber();
        const y = takeNumber();
        cursor = command === "a" ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        current.push({ ...cursor });
        break;
      }
      default:
        // Unknown command — skip one number to make progress.
        i++;
    }
  }

  if (current.length > 0) {
    out.push({ points: current, closed: false });
  }
  return out;
}

// ───────────────────────── GeoJSON ─────────────────────────
//
// GeoJSON lives in WGS84 lat/lng.  We project onto a local tangent plane
// at `mapCenter` via a simple equirectangular projection — accurate to
// <0.5 % over a 1 km block, which is more than enough for an
// intersection.  Then we rotate to the plan frame.

function parseGeoJson(
  text: string,
  file: File,
  sizeBytes: number,
  ctx: ImportContext,
): ImportedBasePlan {
  const warnings: string[] = [];
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("GeoJSON is not valid JSON.");
  }
  const features: BaseLayerFeature[] = [];
  const metresPerLng =
    METRES_PER_LAT_DEGREE * Math.cos((ctx.mapCenter.lat * Math.PI) / 180);

  const toPlan = (lng: number, lat: number): PlanPoint => {
    const dLng = lng - ctx.mapCenter.lng;
    const dLat = lat - ctx.mapCenter.lat;
    return rotatePoint(
      { x: dLng * metresPerLng, y: dLat * METRES_PER_LAT_DEGREE },
      -ctx.rotationRadians,
    );
  };

  const classifyProps = (
    props: Record<string, unknown> | undefined,
  ): BaseLayerKind => {
    const layer = String(props?.layer ?? props?.class ?? props?.type ?? "")
      .toLowerCase();
    if (/crosswalk|traversée|passage/.test(layer)) return "crosswalks";
    if (/median|terre-?plein|refuge/.test(layer)) return "medians";
    if (/building|bâti|batiment/.test(layer)) return "buildings";
    if (/parcel|parcelle|property/.test(layer)) return "parcels";
    if (/contour|elevation|hauteur/.test(layer)) return "contours";
    if (/lane|voie/.test(layer)) return "lane_edges";
    return "roads";
  };

  const pushLineString = (
    coords: number[][],
    props: Record<string, unknown> | undefined,
    closed: boolean,
    id: string,
  ) => {
    const path = coords
      .filter(
        (pt) => Array.isArray(pt) && pt.length >= 2 && pt.every(Number.isFinite),
      )
      .map((pt) => toPlan(pt[0]!, pt[1]!));
    if (path.length < 2) return;
    features.push({ id, kind: classifyProps(props), path, closed });
  };

  const visitGeometry = (
    geom: unknown,
    props: Record<string, unknown> | undefined,
    idBase: string,
  ) => {
    if (!geom || typeof geom !== "object") return;
    const g = geom as { type?: string; coordinates?: unknown };
    const { type, coordinates } = g;
    switch (type) {
      case "LineString":
        if (Array.isArray(coordinates)) {
          pushLineString(
            coordinates as number[][],
            props,
            false,
            `${idBase}`,
          );
        }
        break;
      case "MultiLineString":
        if (Array.isArray(coordinates)) {
          (coordinates as number[][][]).forEach((line, idx) =>
            pushLineString(line, props, false, `${idBase}-${idx}`),
          );
        }
        break;
      case "Polygon":
        if (Array.isArray(coordinates)) {
          (coordinates as number[][][]).forEach((ring, idx) =>
            pushLineString(ring, props, true, `${idBase}-ring-${idx}`),
          );
        }
        break;
      case "MultiPolygon":
        if (Array.isArray(coordinates)) {
          (coordinates as number[][][][]).forEach((poly, pIdx) =>
            poly.forEach((ring, rIdx) =>
              pushLineString(
                ring,
                props,
                true,
                `${idBase}-poly-${pIdx}-ring-${rIdx}`,
              ),
            ),
          );
        }
        break;
      case "GeometryCollection":
        if (
          typeof g === "object" &&
          "geometries" in g &&
          Array.isArray((g as { geometries?: unknown }).geometries)
        ) {
          (g as { geometries: unknown[] }).geometries.forEach((child, idx) =>
            visitGeometry(child, props, `${idBase}-gc-${idx}`),
          );
        }
        break;
      default:
        warnings.push(`Skipped unsupported geometry type "${type}".`);
    }
  };

  const topType =
    (payload && typeof payload === "object" && "type" in payload
      ? (payload as { type?: string }).type
      : undefined) ?? "";
  if (topType === "FeatureCollection") {
    const list = (payload as { features?: unknown[] }).features ?? [];
    list.forEach((feat, idx) => {
      if (!feat || typeof feat !== "object") return;
      const f = feat as {
        geometry?: unknown;
        properties?: Record<string, unknown>;
      };
      visitGeometry(f.geometry, f.properties, `gj-${idx}`);
    });
  } else if (topType === "Feature") {
    const f = payload as {
      geometry?: unknown;
      properties?: Record<string, unknown>;
    };
    visitGeometry(f.geometry, f.properties, "gj-0");
  } else {
    visitGeometry(payload, undefined, "gj-0");
  }

  if (features.length === 0) {
    warnings.push("No LineString / Polygon features parsed from GeoJSON.");
  }

  return {
    features,
    fileMeta: {
      name: file.name,
      sizeBytes,
      mime: file.type || "application/geo+json",
      featureCount: features.length,
    },
    source: ctx.declaredSource ?? "geojson",
    warnings,
  };
}

// ───────────────────────── DXF ─────────────────────────
//
// We parse the subset of DXF that road consultants actually publish for
// topography: LINE and LWPOLYLINE entities in the ENTITIES section.
// Coordinates are treated as metres and centred on (0,0) — TopoExport
// and most CAD exports already use metres at the node centre.

function parseDxf(
  text: string,
  file: File,
  sizeBytes: number,
  ctx: ImportContext,
): ImportedBasePlan {
  const warnings: string[] = [];
  const features: BaseLayerFeature[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim());

  const layerToKind = (layer: string | undefined): BaseLayerKind => {
    const v = (layer ?? "").toLowerCase();
    if (/crosswalk|traversée|passage/.test(v)) return "crosswalks";
    if (/median|tpc/.test(v)) return "medians";
    if (/building|bat/.test(v)) return "buildings";
    if (/parcel/.test(v)) return "parcels";
    if (/contour|altimetrie/.test(v)) return "contours";
    if (/lane|voie/.test(v)) return "lane_edges";
    return "roads";
  };

  const toPlan = (x: number, y: number): PlanPoint =>
    rotatePoint({ x, y }, -ctx.rotationRadians);

  // DXF pairs are (code, value) on adjacent lines.
  const pairs: Array<{ code: number; value: string }> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1] ?? "" });
  }

  let idCounter = 0;
  let inEntities = false;
  let current: {
    type: string;
    layer?: string;
    x?: number;
    y?: number;
    x2?: number;
    y2?: number;
    vertices: Array<{ x: number; y: number }>;
    closed: boolean;
  } | null = null;

  const flush = () => {
    if (!current) return;
    if (current.type === "LINE") {
      if (
        Number.isFinite(current.x) &&
        Number.isFinite(current.y) &&
        Number.isFinite(current.x2) &&
        Number.isFinite(current.y2)
      ) {
        features.push({
          id: `dxf-${idCounter++}`,
          kind: layerToKind(current.layer),
          path: [
            toPlan(current.x!, current.y!),
            toPlan(current.x2!, current.y2!),
          ],
          closed: false,
        });
      }
    } else if (current.type === "LWPOLYLINE" && current.vertices.length >= 2) {
      features.push({
        id: `dxf-${idCounter++}`,
        kind: layerToKind(current.layer),
        path: current.vertices.map((v) => toPlan(v.x, v.y)),
        closed: current.closed,
      });
    }
    current = null;
  };

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i]!;
    if (code === 0) {
      if (value === "SECTION") {
        const next = pairs[i + 1];
        if (next && next.code === 2 && next.value === "ENTITIES") {
          inEntities = true;
        }
        continue;
      }
      if (value === "ENDSEC") {
        inEntities = false;
        flush();
        continue;
      }
      if (!inEntities) continue;
      // Entity boundary.
      flush();
      if (value === "LINE" || value === "LWPOLYLINE") {
        current = {
          type: value,
          vertices: [],
          closed: false,
        };
      }
      continue;
    }
    if (!current) continue;
    switch (code) {
      case 8:
        current.layer = value;
        break;
      case 10:
        if (current.type === "LWPOLYLINE") {
          current.vertices.push({ x: Number(value), y: Number.NaN });
        } else {
          current.x = Number(value);
        }
        break;
      case 20:
        if (current.type === "LWPOLYLINE") {
          const last = current.vertices[current.vertices.length - 1];
          if (last) last.y = Number(value);
        } else {
          current.y = Number(value);
        }
        break;
      case 11:
        current.x2 = Number(value);
        break;
      case 21:
        current.y2 = Number(value);
        break;
      case 70:
        // bit 1 = closed
        if (current.type === "LWPOLYLINE") {
          current.closed = (Number(value) & 1) === 1;
        }
        break;
      default:
        break;
    }
  }
  flush();

  if (features.length === 0) {
    warnings.push(
      "No LINE / LWPOLYLINE entities found.  STLS currently parses only that subset of DXF — export your drawing as polylines or use SVG/GeoJSON.",
    );
  }

  return {
    features,
    fileMeta: {
      name: file.name,
      sizeBytes,
      mime: file.type || "application/dxf",
      featureCount: features.length,
    },
    source: ctx.declaredSource ?? "dxf",
    warnings,
  };
}

// ───────────────────────── helpers ─────────────────────────

function rotatePoint(p: PlanPoint, rad: number): PlanPoint {
  if (rad === 0) return p;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/** Compute the 2D axis-aligned bounds of the imported features, padded
 *  by `padMetres` on each side.  Returns `null` when there are no
 *  features. */
export function boundsFromBaseLayers(
  features: BaseLayerFeature[],
  padMetres = 5,
) {
  if (features.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const feature of features) {
    for (const pt of feature.path) {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX: minX - padMetres,
    maxX: maxX + padMetres,
    minY: minY - padMetres,
    maxY: maxY + padMetres,
  };
}
