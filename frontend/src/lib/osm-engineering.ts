/**
 * OSM-anchored engineering rebuild.
 *
 * Given the road centerlines we just imported from OpenStreetMap, this
 * lib detects the intersection's arms, then synthesises the engineering
 * layers (refuge islands at each approach mouth, supports at each
 * curb, detector loops on each inbound lane, crosswalks across each
 * approach, a controller cabinet in the largest free corner, and the
 * cable runs that connect them) so the AutoCAD page renders something
 * that visually matches a real Plan d'aménagement instead of a blank
 * canvas of OSM polylines.
 *
 * The output is a partial `CivilPlan` payload that the caller merges
 * into the existing plan after a successful OSM import.
 */

import type {
  BaseLayerFeature,
  CableChamber,
  CableRun,
  ControllerCabinet,
  Crosswalk,
  DetectorLoop,
  Lane,
  PlanPoint,
  RefugeIsland,
  RoadArm,
  SignalSupport,
  StopLine,
} from "@/types/civil-plan";

const LANE_W = 3.0;

export interface DetectedArm {
  /** OSM way id this arm came from. */
  wayId: string;
  /** Bearing OUTWARD from the node centre, in radians (atan2 convention). */
  bearingRad: number;
  /** Bearing in compass degrees (0=N, 90=E, …) for the analysis panel. */
  bearingDeg: number;
  /** Estimated half-width of the carriageway (curb to centerline). */
  halfWidth: number;
  /** Number of lanes total (both directions). */
  laneCount: number;
  /** Street name from OSM if known. */
  streetName?: string;
  /** OSM highway category (`primary`, `residential`, etc.). */
  category?: string;
  /** Distance from origin to the road's far end after clipping. */
  reachMetres: number;
}

interface RoundaboutGeometry {
  centre: PlanPoint;
  /** Average radius of the OSM centerline polygon. */
  radius: number;
}

function distance(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
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
  for (const p of points) total += distance(p, centre);
  return total / points.length;
}

/**
 * Find the roundabout perimeter feature, if any.  Used to anchor arms
 * to the roundabout centre rather than the input GPS (which can be a
 * few metres off).
 */
function detectRoundabout(features: BaseLayerFeature[]): RoundaboutGeometry | null {
  const ring = features.find(
    (f) => f.kind === "roads" && f.closed && f.roundabout && f.path.length >= 4,
  );
  if (!ring) return null;
  const centre = polygonCentroid(ring.path);
  const radius = averageRadius(ring.path, centre);
  return { centre, radius };
}

/**
 * Detect approach arms from the imported OSM road network.
 *
 * Algorithm:
 *  1. Walk EVERY node of every open way; if any node is within the
 *     join radius of the intersection centre, that way is a candidate
 *     approach (handles ways whose endpoints sit far from the centre
 *     because of how OSM split the geometry).
 *  2. For each candidate, compute the outward bearing as the direction
 *     from the centre to the FARTHEST node along the way (smooths over
 *     short connector segments and gives a cleaner angle than using
 *     the second node).
 *  3. Cluster candidates into 16 bearing buckets (22.5° each).  This
 *     correctly merges parallel ways that OSM split for a divided
 *     boulevard (one way per direction) but still distinguishes two
 *     approaches that are 90° apart at a cross intersection.
 *  4. For each non-empty bucket pick the highest-priority candidate by
 *     OSM highway category (motorway > trunk > primary > … >
 *     residential), tie-broken by carriageway width.
 */
export function detectArms(
  features: BaseLayerFeature[],
  fallbackCentre: PlanPoint,
  joinTolerance = 60,
): { arms: DetectedArm[]; centre: PlanPoint; roundabout: RoundaboutGeometry | null } {
  const roundabout = detectRoundabout(features);
  const centre = roundabout?.centre ?? fallbackCentre;
  // OSM frequently models approach roads as ways whose nearest node
  // sits 50–80 m from the roundabout perimeter (no explicit short
  // connector).  We use a generous join radius so we still pick those
  // up — false positives are sieved out later by the bearing-bucket
  // clustering, which keeps only one arm per direction.
  const joinRadius = roundabout ? roundabout.radius + joinTolerance : joinTolerance;

  interface Candidate {
    wayId: string;
    bearingRad: number;
    halfWidth: number;
    laneCount: number;
    streetName?: string;
    category?: string;
    reachMetres: number;
    priority: number;
  }
  const candidates: Candidate[] = [];

  for (const f of features) {
    if (f.kind !== "roads" || f.closed) continue;
    if (f.path.length < 2) continue;
    // 1) Find the closest point on the polyline to the centre.  We
    // check every node, not just the endpoints, because OSM often
    // routes a way THROUGH the intersection (so neither endpoint is
    // the entry).
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < f.path.length; i += 1) {
      const d = distance(f.path[i], centre);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestDist > joinRadius) continue;

    // 2) The way may extend in both directions from `bestIdx`.  Each
    // direction is a separate arm — emit candidates for both, taking
    // the farthest-node bearing as the outward direction.
    // Each way is reduced to up to two arm candidates — one for each
    // way endpoint relative to the closest-to-centre node.  An arm
    // direction is only meaningful if that endpoint sits noticeably
    // farther from the centre than the closest node (otherwise the
    // way is just a perimeter stub, not an approach).
    const REACH_PAST_CLOSEST_M = 12;
    const directions: Array<{ end: PlanPoint; reach: number }> = [];
    if (bestIdx > 0) {
      const end = f.path[0];
      directions.push({ end, reach: distance(end, centre) });
    }
    if (bestIdx < f.path.length - 1) {
      const end = f.path[f.path.length - 1];
      directions.push({ end, reach: distance(end, centre) });
    }
    if (directions.length === 0) continue;

    const priority = highwayPriority(f.category);
    for (const dir of directions) {
      if (dir.reach <= bestDist + REACH_PAST_CLOSEST_M) continue;
      const bearingRad = Math.atan2(dir.end.y - centre.y, dir.end.x - centre.x);
      const halfWidth = (f.width ?? 7) / 2;
      const laneCount = Math.max(2, Math.round((f.width ?? 7) / LANE_W));
      candidates.push({
        wayId: f.id,
        bearingRad,
        halfWidth,
        laneCount,
        streetName: f.label,
        category: f.category,
        reachMetres: dir.reach,
        priority,
      });
    }
  }

  // 3) Cluster into 16 bearing buckets (22.5° each).  Bucket index =
  // floor(((bearing + π) / (2π)) * 16) mod 16.
  const buckets = new Map<number, Candidate[]>();
  for (const c of candidates) {
    const idx = Math.floor(((c.bearingRad + Math.PI) / (2 * Math.PI)) * 16) % 16;
    if (!buckets.has(idx)) buckets.set(idx, []);
    buckets.get(idx)!.push(c);
  }

  // 4) Per bucket pick the best representative.  Merge adjacent
  // buckets too — if a road sits exactly on a bucket boundary, OSM
  // ways might land in two adjacent buckets with the same name.
  const arms: DetectedArm[] = [];
  const usedBuckets = new Set<number>();
  const sortedBucketIds = Array.from(buckets.keys()).sort(
    (a, b) => (buckets.get(b)!.length - buckets.get(a)!.length),
  );
  for (const id of sortedBucketIds) {
    if (usedBuckets.has(id)) continue;
    const here = buckets.get(id)!;
    // Merge same-name candidates from adjacent buckets.
    const adj = [(id + 15) % 16, (id + 1) % 16];
    const pool = [...here];
    for (const a of adj) {
      const adjList = buckets.get(a) ?? [];
      const matchingName = adjList.filter((c) =>
        here.some((h) => h.streetName && h.streetName === c.streetName),
      );
      if (matchingName.length > 0 && !usedBuckets.has(a)) {
        pool.push(...matchingName);
        usedBuckets.add(a);
      }
    }
    usedBuckets.add(id);
    pool.sort(
      (a, b) =>
        b.priority - a.priority ||
        b.halfWidth - a.halfWidth ||
        b.reachMetres - a.reachMetres,
    );
    const winner = pool[0];
    arms.push({
      wayId: winner.wayId,
      bearingRad: winner.bearingRad,
      bearingDeg: bearingToCompass(winner.bearingRad),
      halfWidth: winner.halfWidth,
      laneCount: winner.laneCount,
      streetName: winner.streetName,
      category: winner.category,
      reachMetres: winner.reachMetres,
    });
  }

  arms.sort((a, b) => a.bearingRad - b.bearingRad);

  // Post-cluster merge — adjacent buckets can hold two candidates that
  // are actually the same approach (e.g. divided boulevard at 197° and
  // 206°).  Walk the sorted list and merge any pair within 28°,
  // keeping the higher-priority / wider candidate.
  const merged: DetectedArm[] = [];
  for (const arm of arms) {
    const last = merged[merged.length - 1];
    if (last) {
      const diff = Math.abs(arm.bearingDeg - last.bearingDeg);
      const wrappedDiff = Math.min(diff, 360 - diff);
      if (wrappedDiff < 28) {
        // Keep whichever is higher priority / wider.
        const lastP = highwayPriority(last.category);
        const armP = highwayPriority(arm.category);
        const replace =
          armP > lastP ||
          (armP === lastP && arm.halfWidth > last.halfWidth);
        if (replace) merged[merged.length - 1] = arm;
        continue;
      }
    }
    merged.push(arm);
  }
  // Wrap-around check: merge last+first if they're within 28°.
  if (merged.length >= 2) {
    const first = merged[0];
    const last = merged[merged.length - 1];
    const diff = Math.abs(first.bearingDeg - last.bearingDeg);
    const wrapped = Math.min(diff, 360 - diff);
    if (wrapped < 28) {
      const firstP = highwayPriority(first.category);
      const lastP = highwayPriority(last.category);
      if (lastP > firstP || (lastP === firstP && last.halfWidth > first.halfWidth)) {
        merged.shift();
      } else {
        merged.pop();
      }
    }
  }
  return { arms: merged, centre, roundabout };
}

function highwayPriority(category: string | undefined): number {
  switch (category) {
    case "motorway":
    case "motorway_link":
      return 7;
    case "trunk":
    case "trunk_link":
      return 6;
    case "primary":
    case "primary_link":
      return 5;
    case "secondary":
    case "secondary_link":
      return 4;
    case "tertiary":
    case "tertiary_link":
      return 3;
    case "residential":
    case "unclassified":
      return 2;
    case "living_street":
      return 1;
    default:
      return 0;
  }
}

/** Convert atan2 bearing (radians, 0=east, π/2=north) to compass
 *  degrees (0=north, 90=east). */
function bearingToCompass(rad: number): number {
  const compass = ((90 - (rad * 180) / Math.PI) % 360 + 360) % 360;
  return Math.round(compass);
}

// ─────────────────────────────────────────────────────────────────────────
// Engineering rebuild
// ─────────────────────────────────────────────────────────────────────────

interface EngineeringPayload {
  arms: RoadArm[];
  refugeIslands: RefugeIsland[];
  crosswalks: Crosswalk[];
  stopLines: StopLine[];
  supports: SignalSupport[];
  loops: DetectorLoop[];
  chambers: CableChamber[];
  cableRuns: CableRun[];
  cabinet: ControllerCabinet;
}

export interface BuildOptions {
  /** Tag prefix used for cable labels (e.g. "C15" → "C15-A-3.6"). */
  carrefourTag: string;
  /** Origin where OSM features were re-centred. */
  centre: PlanPoint;
  /** When the OSM roundabout was detected, the geometry. */
  roundabout?: RoundaboutGeometry | null;
}

/**
 * Build a full engineering layer payload anchored to the detected OSM
 * arms.  Each arm becomes a synthetic `RoadArm` (so the existing
 * lane/arrow/median renderer still works), with refuge island, stop
 * line, crosswalks and supports placed at its mouth, plus loop
 * detectors on each inbound lane.  A cabinet sits in the largest
 * "free wedge" between two adjacent arms; chambers ring the node so
 * cable runs reach every support.
 */
export function buildEngineeringFromArms(
  arms: DetectedArm[],
  options: BuildOptions,
): EngineeringPayload {
  const { carrefourTag, centre, roundabout } = options;
  const NODE_RADIUS = roundabout ? roundabout.radius + 1.5 : 4;
  const STOP_DIST = NODE_RADIUS + 6;
  const REFUGE_DIST = NODE_RADIUS + 8;
  const SUPPORT_DIST = NODE_RADIUS + 6;
  const POTELET_DIST = NODE_RADIUS + 14;
  const LOOP_DIST = NODE_RADIUS + 10;
  const ADVANCE_LOOP_DIST = NODE_RADIUS + 22;

  // Helpers ------------------------------------------------------------
  const dirVec = (b: number): PlanPoint => ({ x: Math.cos(b), y: Math.sin(b) });
  const perpVec = (v: PlanPoint): PlanPoint => ({ x: -v.y, y: v.x });
  const addP = (a: PlanPoint, b: PlanPoint, s = 1): PlanPoint => ({
    x: a.x + b.x * s,
    y: a.y + b.y * s,
  });
  const armCardinal = (i: number): "N" | "E" | "S" | "W" => {
    // Map detected arm index → cardinal letter pool.  We just cycle
    // through the four pools; if there are >4 arms the extras reuse W.
    return (["N", "E", "S", "W"] as const)[i % 4];
  };
  const QUADRANT_LETTERS: Record<"N" | "E" | "S" | "W", [string, string, string, string]> = {
    N: ["A", "B", "C", "D"],
    E: ["E", "F", "G", "H"],
    S: ["I", "J", "K", "L"],
    W: ["M", "N", "O", "P"],
  };

  const armRecords: RoadArm[] = [];
  const refugeIslands: RefugeIsland[] = [];
  const crosswalks: Crosswalk[] = [];
  const stopLines: StopLine[] = [];
  const supports: SignalSupport[] = [];
  const supportPos: Record<string, PlanPoint> = {};
  const loops: DetectorLoop[] = [];

  let pIndex = 1;
  let vIndex = 1;

  arms.forEach((det, idx) => {
    const card = armCardinal(idx);
    const d = dirVec(det.bearingRad);
    const p = perpVec(d);
    const labelDir = card === "N"
      ? "Nord"
      : card === "S"
        ? "Sud"
        : card === "E"
          ? "Est"
          : "Ouest";

    // Build a synthetic RoadArm so existing lane/arrow/median rendering
    // applies on top of the real OSM road centerline.
    const inboundCount = Math.max(1, Math.floor(det.laneCount / 2));
    const outboundCount = Math.max(1, Math.ceil(det.laneCount / 2));
    const lanes: Lane[] = [];
    const medianHalf = 1.0;
    let inOff = medianHalf + LANE_W / 2;
    for (let i = 0; i < inboundCount; i += 1) {
      lanes.push({
        id: `arm-osm-${idx}-IN-${i + 1}`,
        armId: `arm-osm-${idx}`,
        offset: inOff,
        width: LANE_W,
        direction: "in",
        kind:
          i === 0
            ? "left"
            : i === inboundCount - 1
              ? "through-right"
              : "through",
      });
      inOff += LANE_W;
    }
    let outOff = -(medianHalf + LANE_W / 2);
    for (let i = 0; i < outboundCount; i += 1) {
      lanes.push({
        id: `arm-osm-${idx}-OUT-${i + 1}`,
        armId: `arm-osm-${idx}`,
        offset: outOff,
        width: LANE_W,
        direction: "out",
        kind: "through",
      });
      outOff -= LANE_W;
    }

    const arm: RoadArm = {
      id: `arm-osm-${idx}`,
      label: `V${idx + 1} — ${det.streetName ?? `Arm ${idx + 1}`}`,
      bearing: card,
      streetName: det.streetName ?? `Arm ${idx + 1}`,
      axis: {
        from: addP(centre, d, NODE_RADIUS),
        to: addP(centre, d, Math.min(45, det.reachMetres - 1)),
      },
      halfWidth: det.halfWidth,
      medianWidth: 2 * medianHalf,
      lanes,
    };
    armRecords.push(arm);

    // Refuge island sitting on the median, ~ where pedestrians wait.
    refugeIslands.push({
      id: `island-osm-${idx}`,
      label: `P${pIndex}`,
      centre: addP(centre, d, REFUGE_DIST),
      shape: "pill",
      length: det.halfWidth * 2 - 4,
      width: 3.5,
      angle: det.bearingRad + Math.PI / 2,
    });
    pIndex += 1;

    // Stop line.
    stopLines.push({
      id: `sl-osm-${idx}`,
      armId: arm.id,
      centre: addP(addP(centre, d, STOP_DIST), p, det.halfWidth / 2),
      length: det.halfWidth,
      angle: det.bearingRad + Math.PI / 2,
    });

    // Crosswalk across the approach (curb-to-curb).
    crosswalks.push({
      id: `cw-osm-${idx}`,
      label: `P${pIndex}`,
      armId: arm.id,
      centre: addP(centre, d, STOP_DIST + 2.2),
      length: det.halfWidth * 2,
      width: 3.5,
      angle: det.bearingRad + Math.PI / 2,
    });
    pIndex += 1;

    // Supports: cantilever potence (right curb), poteau on median,
    // 2 potelets at the far side of the crosswalk.
    const inboundCurb = det.halfWidth + 1.6;
    const refugeOff = medianHalf + 1.0;
    const [l1, l2, l3, l4] = QUADRANT_LETTERS[card];
    const placements: Array<{
      letter: string;
      kind: SignalSupport["kind"];
      pos: PlanPoint;
      hardware: string;
      orientation: number;
    }> = [
      {
        letter: l1,
        kind: "potence",
        hardware: "R14dtd + R12",
        pos: addP(addP(centre, d, SUPPORT_DIST), p, inboundCurb),
        orientation: Math.atan2(-d.y, -d.x),
      },
      {
        letter: l2,
        kind: "poteau",
        hardware: "R11v + R12",
        pos: addP(addP(centre, d, SUPPORT_DIST), p, refugeOff),
        orientation: Math.atan2(-d.y, -d.x),
      },
      {
        letter: l3,
        kind: "potelet",
        hardware: "R12",
        pos: addP(addP(centre, d, POTELET_DIST), p, inboundCurb),
        orientation: Math.atan2(p.y, p.x),
      },
      {
        letter: l4,
        kind: "potelet",
        hardware: "R12",
        pos: addP(addP(centre, d, POTELET_DIST), p, -inboundCurb),
        orientation: Math.atan2(-p.y, -p.x),
      },
    ];
    for (const place of placements) {
      supports.push({
        id: place.letter,
        kind: place.kind,
        hardwareLabel: place.hardware,
        position: place.pos,
        signalHeads: [
          {
            id: `${place.letter}-head`,
            type:
              place.kind === "potence"
                ? "R14dtd"
                : place.kind === "poteau"
                  ? "R11v"
                  : "R12",
            signalGroupId: `SG-${idx + 1}`,
            orientation: place.orientation,
          },
        ],
      });
      supportPos[place.letter] = place.pos;
    }

    // Loops: one stop-line presence loop per inbound lane + one
    // advance loop on the rightmost (through-right) lane.
    const inLanes = lanes
      .filter((ln) => ln.direction === "in")
      .sort((a, b) => a.offset - b.offset);
    inLanes.forEach((lane) => {
      loops.push({
        id: `Bcl-V${vIndex}`,
        label: `V${vIndex}`,
        centre: addP(addP(centre, d, LOOP_DIST), p, lane.offset),
        width: 2.0,
        length: 2.0,
        angle: det.bearingRad,
        assignedLaneId: lane.id,
      });
      vIndex += 1;
    });
    if (inLanes.length > 0) {
      const last = inLanes[inLanes.length - 1];
      loops.push({
        id: `Bcl-V${vIndex}`,
        label: `V${vIndex}`,
        centre: addP(addP(centre, d, ADVANCE_LOOP_DIST), p, last.offset),
        width: 2.0,
        length: 2.4,
        angle: det.bearingRad,
        assignedLaneId: last.id,
      });
      vIndex += 1;
    }
  });

  // Cabinet: place in the largest angular wedge between adjacent arms,
  // at a comfortable distance from the centre.
  const cabinetPos = pickCabinetPosition(arms.map((a) => a.bearingRad), centre, NODE_RADIUS + 12);
  const cabinet: ControllerCabinet = {
    id: carrefourTag,
    label: carrefourTag,
    position: cabinetPos,
    footprint: 2.0,
  };

  // Chambers: one near the cabinet + one near each arm support cluster.
  const chambers: CableChamber[] = [
    {
      id: "1",
      label: "1",
      kind: "slt",
      position: addP(cabinetPos, dirVec(0), 2.5),
      size: 1.0,
    },
  ];
  arms.forEach((det, idx) => {
    const d = dirVec(det.bearingRad);
    chambers.push({
      id: String(idx + 2),
      label: String(idx + 2),
      kind: "slt",
      position: addP(centre, d, NODE_RADIUS + 18),
      size: 1.2,
    });
  });

  // Cable runs: each support feeds from cabinet → chamber 1 → its arm
  // chamber → support.  Loops bundle through chamber 1 only.
  const cableRuns: CableRun[] = [];
  // Ring through every SLT chamber.
  const ringPath: PlanPoint[] = [
    cabinet.position,
    ...chambers.map((c) => c.position),
    cabinet.position,
  ];
  cableRuns.push({
    id: `${carrefourTag}-RING`,
    kind: "ring",
    path: ringPath,
    spec: "Ceinturage chambres",
    from: carrefourTag,
    to: "RING",
    length: Math.round(pathLength(ringPath)),
    label: `${carrefourTag}-CEINT`,
  });
  arms.forEach((det, idx) => {
    const armChamber = chambers[idx + 1];
    if (!armChamber) return;
    const card = armCardinal(idx);
    QUADRANT_LETTERS[card].forEach((letter, lIdx) => {
      const dst = supportPos[letter];
      if (!dst) return;
      const path = [cabinet.position, chambers[0].position, armChamber.position, dst];
      const spec = lIdx === 0 ? "12 G 1.5" : "5 G 1.5";
      cableRuns.push({
        id: `${carrefourTag}-${letter}`,
        kind: "signal",
        path,
        spec,
        from: carrefourTag,
        to: letter,
        length: Math.round(pathLength(path) * 1.05 + 2),
        label: `${carrefourTag}-${letter}-${spec.replace(/\s+/g, "")}`,
      });
    });
  });

  return {
    arms: armRecords,
    refugeIslands,
    crosswalks,
    stopLines,
    supports,
    loops,
    chambers,
    cableRuns,
    cabinet,
  };
}

function pickCabinetPosition(
  bearings: number[],
  centre: PlanPoint,
  distance: number,
): PlanPoint {
  if (bearings.length === 0) {
    return { x: centre.x - distance, y: centre.y - distance };
  }
  const sorted = [...bearings].sort((a, b) => a - b);
  // Find the largest gap between consecutive bearings (wrapping).
  let bestGapMid = sorted[0] + Math.PI; // fallback
  let bestGap = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    const gap = b - a;
    if (gap > bestGap) {
      bestGap = gap;
      bestGapMid = (a + b) / 2;
    }
  }
  return {
    x: centre.x + Math.cos(bestGapMid) * distance,
    y: centre.y + Math.sin(bestGapMid) * distance,
  };
}

function pathLength(points: PlanPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}
