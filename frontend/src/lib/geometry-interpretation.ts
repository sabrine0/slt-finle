/**
 * Geometry Interpretation Layer.
 *
 * Pure, side-effect-free conversion of an `ObservedGeometry` plus
 * an `IntersectionStudy` into structured engineering overlays
 * expressed in real lat/lng coordinates. This layer is the spatial
 * backbone of STLS — it stays deliberately decoupled from the map
 * renderer, the proposal engine and the engineering inference so
 * that it can later be fed by:
 *
 *   - DXF/CAD imports
 *   - AI vision lane extraction
 *   - editable user-overrides
 *
 * without changing the consumers (map overlays, PDF generators,
 * simulation runtime export).
 *
 * Output is approximate by design. Bearings + lane counts + widths
 * from OSM are projected into local equirectangular space at the
 * intersection scale (~100 m) which is well within the error budget
 * of the heuristic engine that produced them.
 */

import type {
  ApproachBearing,
  ConflictPoint,
  IntersectionStudy,
  ObservedApproach,
} from "./ai-engineering-api";

export interface LatLng {
  lat: number;
  lng: number;
}

export type OverlayLayerId =
  | "centerlines"
  | "lanes"
  | "stop-lines"
  | "movements"
  | "pedestrians"
  | "detectors"
  | "signal-heads"
  | "conflicts";

/**
 * Visual + future-edit-ready descriptor for an approach centerline.
 */
export interface EngineeringCenterline {
  id: string;
  approachBearing: number;
  approachLabel: string;
  isDominant: boolean;
  /** [centerOfIntersection, outerEndOfApproach] */
  path: [LatLng, LatLng];
}

/**
 * Lane strip parallel to a centerline — drawn as a thin polyline
 * between the two stop-line ends for that lane.
 */
export interface EngineeringLaneStrip {
  id: string;
  approachBearing: number;
  laneIndex: number;
  path: [LatLng, LatLng];
}

export interface EngineeringStopLine {
  id: string;
  approachBearing: number;
  path: [LatLng, LatLng];
  /** Distance from intersection center, m. */
  distanceFromCenter: number;
}

export interface EngineeringPedestrianCrossing {
  id: string;
  approachBearing: number;
  path: [LatLng, LatLng];
  widthMeters: number;
}

export type DetectorRole =
  | "stop-line"
  | "queue"
  | "advance"
  | "pedestrian-button"
  | "tram";

export interface EngineeringDetector {
  id: string;
  approachBearing: number;
  role: DetectorRole;
  position: LatLng;
  radiusMeters: number;
}

export interface EngineeringSignalHead {
  id: string;
  approachBearing: number;
  position: LatLng;
  /** Kept generic — vehicle vs pedestrian vs tram. */
  kind: "vehicle" | "pedestrian" | "tram";
}

export interface EngineeringConflictHotspot {
  id: string;
  position: LatLng;
  weight: number;
  label: string;
}

export interface EngineeringMovementArrow {
  id: string;
  approachBearing: number;
  turning: "through" | "left" | "right";
  /** Polyline of 3-6 points approximating the trajectory. */
  path: LatLng[];
}

export interface GeometryInterpretation {
  /** Centroid (intersection point) used for all derived geometry. */
  center: LatLng;
  /** Approximate intersection radius, m. */
  intersectionRadiusMeters: number;
  centerlines: EngineeringCenterline[];
  lanes: EngineeringLaneStrip[];
  stopLines: EngineeringStopLine[];
  pedestrianCrossings: EngineeringPedestrianCrossing[];
  detectors: EngineeringDetector[];
  signalHeads: EngineeringSignalHead[];
  conflictHotspots: EngineeringConflictHotspot[];
  movements: EngineeringMovementArrow[];
}

// ---------------------------------------------------------------
// Math helpers (local equirectangular projection — OK at <1 km).
// ---------------------------------------------------------------

const METERS_PER_DEG_LAT = 111_111;

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function offsetLatLng(
  origin: LatLng,
  bearingDeg: number,
  distanceMeters: number,
): LatLng {
  const bRad = toRad(bearingDeg);
  const latRad = toRad(origin.lat);
  const dLat = (distanceMeters * Math.cos(bRad)) / METERS_PER_DEG_LAT;
  const dLng =
    (distanceMeters * Math.sin(bRad)) /
    (METERS_PER_DEG_LAT * Math.max(Math.cos(latRad), 1e-6));
  return { lat: origin.lat + dLat, lng: origin.lng + dLng };
}

/**
 * Perpendicular point: from `origin`, walk along bearing+90 (right
 * of approach) by `distanceMeters`. Negative distance walks left.
 */
function perpendicular(
  origin: LatLng,
  bearingDeg: number,
  distanceMeters: number,
): LatLng {
  return offsetLatLng(origin, bearingDeg + 90, distanceMeters);
}

// ---------------------------------------------------------------
// Interpreter
// ---------------------------------------------------------------

interface InterpretInput {
  center: LatLng;
  study: IntersectionStudy;
}

/**
 * Build the engineering overlay set from a study + center coords.
 * The function is intentionally pure — it never reads the network
 * and never touches React. Outputs are stable for the same inputs.
 */
export function interpretGeometry({
  center,
  study,
}: InterpretInput): GeometryInterpretation {
  const approaches = study.observedGeometry.approaches ?? [];
  const dominant: ApproachBearing[] = study.dominantAxis?.bearings
    ? [...study.dominantAxis.bearings]
    : [];
  const intersectionRadius = estimateIntersectionRadius(approaches);
  const stopLineOffset = Math.max(8, intersectionRadius * 0.9);
  const pedCrossingOffset = stopLineOffset + 3;
  const advanceDetectorOffset = stopLineOffset + 50;
  const queueDetectorOffset = stopLineOffset + 20;
  const stopDetectorOffset = stopLineOffset + 1;
  const approachReach = 70;

  const centerlines: EngineeringCenterline[] = [];
  const lanes: EngineeringLaneStrip[] = [];
  const stopLines: EngineeringStopLine[] = [];
  const pedestrianCrossings: EngineeringPedestrianCrossing[] = [];
  const detectors: EngineeringDetector[] = [];
  const signalHeads: EngineeringSignalHead[] = [];
  const movements: EngineeringMovementArrow[] = [];

  approaches.forEach((a, idx) => {
    const bearing = a.bearingDegrees;
    const halfWidth = Math.max(a.widthMeters, a.laneCount * 3) / 2;
    const isDominant = dominant.includes(a.bearing);

    // Centerline — center → outward along the approach bearing.
    const outer = offsetLatLng(center, bearing, approachReach);
    centerlines.push({
      id: `cl-${idx}`,
      approachBearing: bearing,
      approachLabel: a.bearing,
      isDominant,
      path: [center, outer],
    });

    // Stop-line — perpendicular segment at stopLineOffset from center.
    const stopAnchor = offsetLatLng(center, bearing, stopLineOffset);
    const stopLeft = perpendicular(stopAnchor, bearing, -halfWidth);
    const stopRight = perpendicular(stopAnchor, bearing, halfWidth);
    stopLines.push({
      id: `sl-${idx}`,
      approachBearing: bearing,
      path: [stopLeft, stopRight],
      distanceFromCenter: stopLineOffset,
    });

    // Lane separators (laneCount-1 internal separators).
    for (let li = 1; li < a.laneCount; li += 1) {
      const t = li / a.laneCount; // 0..1 across the width
      const sepOffset = (t - 0.5) * 2 * halfWidth;
      const sepNear = perpendicular(stopAnchor, bearing, sepOffset);
      const sepFar = perpendicular(
        offsetLatLng(center, bearing, approachReach),
        bearing,
        sepOffset,
      );
      lanes.push({
        id: `lane-${idx}-${li}`,
        approachBearing: bearing,
        laneIndex: li,
        path: [sepNear, sepFar],
      });
    }

    // Pedestrian crossing — outside the stop-line.
    const pedAnchor = offsetLatLng(center, bearing, pedCrossingOffset);
    const pedLeft = perpendicular(pedAnchor, bearing, -halfWidth);
    const pedRight = perpendicular(pedAnchor, bearing, halfWidth);
    pedestrianCrossings.push({
      id: `pc-${idx}`,
      approachBearing: bearing,
      path: [pedLeft, pedRight],
      widthMeters: 2 * halfWidth,
    });

    // Signal head — to the right of approach, at stop-line distance.
    signalHeads.push({
      id: `sh-${idx}`,
      approachBearing: bearing,
      position: perpendicular(stopAnchor, bearing, halfWidth + 1),
      kind: "vehicle",
    });
    // Pedestrian signal head — slightly outside the crossing.
    signalHeads.push({
      id: `sh-p-${idx}`,
      approachBearing: bearing,
      position: perpendicular(pedAnchor, bearing, halfWidth + 1),
      kind: "pedestrian",
    });

    // Detectors at stop-line, queue, advance distances.
    detectors.push({
      id: `det-stop-${idx}`,
      approachBearing: bearing,
      role: "stop-line",
      position: offsetLatLng(center, bearing, stopDetectorOffset),
      radiusMeters: 1.4,
    });
    detectors.push({
      id: `det-queue-${idx}`,
      approachBearing: bearing,
      role: "queue",
      position: offsetLatLng(center, bearing, queueDetectorOffset),
      radiusMeters: 1.4,
    });
    detectors.push({
      id: `det-advance-${idx}`,
      approachBearing: bearing,
      role: "advance",
      position: offsetLatLng(center, bearing, advanceDetectorOffset),
      radiusMeters: 1.4,
    });
    // Pedestrian push-button at the corner of the crossing.
    detectors.push({
      id: `det-pb-${idx}`,
      approachBearing: bearing,
      role: "pedestrian-button",
      position: perpendicular(pedAnchor, bearing, halfWidth + 1.5),
      radiusMeters: 1,
    });

    // Through movement arrow — straight through the centre.
    const throughIn = offsetLatLng(center, bearing, stopLineOffset);
    const throughOut = offsetLatLng(center, bearing + 180, stopLineOffset);
    movements.push({
      id: `mv-th-${idx}`,
      approachBearing: bearing,
      turning: "through",
      path: [throughIn, center, throughOut],
    });
  });

  // Conflict hotspots — place inside the central plate using their
  // (x, y) coordinates from the study (0-100 normalised space).
  const conflictHotspots = buildConflictHotspots(
    study.estimatedConflictPoints ?? [],
    center,
    intersectionRadius,
  );

  return {
    center,
    intersectionRadiusMeters: intersectionRadius,
    centerlines,
    lanes,
    stopLines,
    pedestrianCrossings,
    detectors,
    signalHeads,
    conflictHotspots,
    movements,
  };
}

function estimateIntersectionRadius(approaches: ObservedApproach[]): number {
  if (approaches.length === 0) return 10;
  const avgWidth =
    approaches.reduce((sum, a) => sum + a.widthMeters, 0) / approaches.length;
  return Math.max(8, Math.min(22, avgWidth * 1.3));
}

function buildConflictHotspots(
  conflicts: ConflictPoint[],
  center: LatLng,
  radius: number,
): EngineeringConflictHotspot[] {
  return conflicts.map((c, idx) => {
    // x/y are 0-100 in the SVG. Re-project to a local square of
    // ±radius around the centre.
    const offsetEast = ((c.x - 50) / 50) * radius * 0.7;
    const offsetNorth = ((50 - c.y) / 50) * radius * 0.7;
    const eastPoint = offsetLatLng(center, 90, offsetEast);
    const finalPos = offsetLatLng(eastPoint, 0, offsetNorth);
    return {
      id: `cf-${idx}-${c.id}`,
      position: finalPos,
      weight: c.weight,
      label: c.label,
    };
  });
}
