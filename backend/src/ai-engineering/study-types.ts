/**
 * Intersection study — produced by `StudyAnalyzerAdapter` BEFORE
 * proposal generation. The study describes what the AI sees on the
 * site (geometry, classification, constraints, complexity score) and
 * is the data the operator reviews before deciding which strategy
 * family to materialise.
 *
 * Proposals are then derived FROM the study (filtered + scored
 * against the classification + constraints), not picked from a flat
 * template catalogue.
 */

import type { ApproachBearing, ScopeKind } from './proposal-types';

// ---------------------------------------------------------------
// Input — geometry the frontend may supply (OSM Overpass, DXF, etc.)
// ---------------------------------------------------------------

/**
 * Optional real-world geometry payload sourced by the frontend (OSM
 * Overpass for now, AutoCAD/DXF in Phase 2). When absent, the
 * analyzer falls back to heuristics derived from name + scope + shape
 * hint.
 */
export interface ObservedGeometry {
  /** Roads radiating from the intersection point. */
  approaches: ObservedApproach[];
  /** Marked pedestrian crossings within 30 m of the point. */
  pedestrianCrossings: ObservedCrossing[];
  /** Tram / light-rail lines crossing the intersection (if any). */
  tramLines: ObservedTramLine[];
  /** Nearby points of interest informing pedestrian context. */
  nearbyPoi: ObservedPoi[];
  /** OSM land-use polygons within 200 m, normalised. */
  landUses?: Array<{
    kind: 'residential' | 'commercial' | 'industrial' | 'retail' | 'education' | 'institutional' | 'park' | 'farmland' | 'other';
    distanceMeters: number;
  }>;
  /** Distance (m) to the next signalled intersection on the dominant axis. */
  nearestSignalDistanceMeters?: number;
  /** Whether the OSM data showed a roundabout/circular geometry. */
  hasRoundabout?: boolean;
  /** Free-form attribution / data provenance (e.g. "OSM Overpass 2026-05-11"). */
  source?: string;
}

export interface ObservedApproach {
  /** Cardinal bearing approximated from the way orientation. */
  bearing: ApproachBearing;
  /** Bearing in degrees (0 = North, clockwise). */
  bearingDegrees: number;
  /** OSM highway tag (primary, secondary, tertiary, residential, …). */
  highwayClass: string;
  /** Number of lanes if declared by OSM, else estimated from class. */
  laneCount: number;
  /** Confidence in the lane count : 1.0 = OSM tag, 0.5 = inferred from class. */
  laneCountConfidence?: number;
  /** Width in meters if declared, else estimated. */
  widthMeters: number;
  /** Whether OSM says it's one-way. */
  oneWay: boolean;
  /** Street name when known. */
  name?: string;
  /** Speed limit if tagged (km/h). */
  speedKph?: number;
}

export interface ObservedCrossing {
  type: 'marked' | 'signalised' | 'refuge' | 'zebra';
  approachBearing: ApproachBearing;
  /** Distance in meters between curbs. */
  widthMeters: number;
}

export interface ObservedTramLine {
  axisBearing: ApproachBearing;
  name?: string;
}

export interface ObservedPoi {
  kind:
    | 'school'
    | 'mosque'
    | 'church'
    | 'hospital'
    | 'market'
    | 'station'
    | 'park'
    | 'shopping'
    | 'other';
  name?: string;
  distanceMeters: number;
}

/**
 * Land use / surroundings characterisation derived from OSM
 * landuse polygons + nearby highways. Drives pedestrian / heavy
 * vehicle assumptions, timing strategy, and warnings.
 */
export type MapContextKind =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'mixed-urban'
  | 'boulevard'
  | 'rural'
  | 'logistics-corridor'
  | 'institutional'
  | 'unknown';

export interface MapContext {
  kind: MapContextKind;
  label: string;
  /** Drivers that justified the classification. */
  drivers: string[];
  /** Heavy-vehicle exposure 0-10. */
  heavyVehicleScore: number;
  /** Confidence in this classification 0-1. */
  confidence: number;
}

// ---------------------------------------------------------------
// Output — the analysis the AI produces
// ---------------------------------------------------------------

export type IntersectionClassification =
  | 'compact-crossroad'
  | 'skewed-crossroad'
  | 'boulevard-crossing'
  | 't-junction'
  | 'y-junction'
  | 'multi-leg-junction'
  | 'tramway-intersection'
  | 'pedestrian-heavy-node'
  | 'corridor-node'
  | 'offset-intersection'
  | 'mini-roundabout'
  | 'plaza';

export interface StudyConstraint {
  code:
    | 'left-turn-conflict'
    | 'queue-spillback-risk'
    | 'blocked-box-risk'
    | 'long-pedestrian-crossing'
    | 'asymmetric-demand'
    | 'visibility-skew'
    | 'tram-priority-required'
    | 'corridor-coordination'
    | 'high-pedestrian-exposure'
    | 'mixed-modes'
    | 'irregular-signal-visibility'
    | 'multiple-turning-conflicts'
    // Phase 1.6 — roundabout + geometry-specific
    | 'insufficient-deflection'
    | 'pedestrian-refuge-absent'
    | 'sight-distance-risk'
    | 'oversized-crossing'
    | 'merge-geometry-risk'
    | 'heavy-vehicle-exposure'
    | 'roundabout-capacity-exceeded';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  /** Mitigation strategies the AI will favour because of this constraint. */
  recommendedMitigation: string[];
}

export interface ConflictPoint {
  id: string;
  /** Approximate position on a 0-100 grid (intersection-relative). */
  x: number;
  y: number;
  /** Conflict severity: number of conflicting movements at this point. */
  weight: number;
  /** Human-readable label (e.g. "E-gauche vs W-tout-droit"). */
  label: string;
}

export interface DominantAxis {
  /** Two bearings forming the dominant axis (e.g. ['E', 'W']). */
  bearings: [ApproachBearing, ApproachBearing];
  /** Why this axis is dominant (highway class, lane count, name). */
  reason: string;
}

export interface PedestrianExposure {
  /** 0-10 score (0 = no pedestrians, 10 = heavy continuous flow). */
  score: number;
  level: 'low' | 'moderate' | 'high' | 'critical';
  drivers: string[];
}

/**
 * Per-section confidence — how much the analyzer trusts a given
 * conclusion. Drives explicit "estimated" labels in the UI.
 */
export interface StudyConfidence {
  /** Overall geometry confidence (1.0 = real OSM, 0.4 = synthetic). */
  geometry: number;
  /** Classification fit confidence. */
  classification: number;
  /** Pedestrian-exposure confidence. */
  pedestrianExposure: number;
  /** Strategy-recommendation confidence. */
  strategy: number;
}

export interface IntersectionStudy {
  id: string;
  /** Working name from the operator. */
  name: string;
  scope: ScopeKind;
  latitude: number;
  longitude: number;

  // ----- Geometry observed (real or heuristic) -----
  observedGeometry: ObservedGeometry;

  // ----- Classification -----
  classification: IntersectionClassification;
  classificationLabel: string;
  classificationReason: string;

  // ----- Map context (residential / commercial / industrial / boulevard) -----
  mapContext: MapContext;

  // ----- Confidence -----
  confidence: StudyConfidence;

  // ----- Complexity scoring -----
  complexityScore: number;
  complexityBand: 'low' | 'moderate' | 'high' | 'critical';
  complexityDrivers: string[];

  // ----- Engineering observations -----
  dominantAxis: DominantAxis | null;
  pedestrianExposure: PedestrianExposure;
  estimatedConflictPoints: ConflictPoint[];
  totalConflictWeight: number;

  // ----- Detected constraints -----
  constraints: StudyConstraint[];

  // ----- Recommended strategy families -----
  /**
   * Variant codes the analyzer endorses for this site, ordered by
   * fit score (descending). The proposal generator filters its full
   * catalogue down to this list.
   */
  recommendedVariantCodes: string[];

  // ----- Audit -----
  generatedAt: string;
  expiresAt: string;
  source: string;
}
