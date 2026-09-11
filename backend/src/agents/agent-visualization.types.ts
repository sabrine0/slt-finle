/**
 * Shapes emitted by the visualization / foresight agents.
 *
 * These two agents differ from the control agents (police, emergency,
 * bus, intersection/city manager): instead of a single distilled
 * action, they produce a *layer* the operator UI renders directly —
 * a heatmap of network pressure and a set of geo-located "why this is
 * happening" insight cards (the Waze-style anticipation feed).
 *
 * The decision still flows through the normal AgentDecision channel;
 * the layer travels in `decision.payload` so the existing /agents
 * pipeline (persistence, recent-runs feed, websocket) carries it for
 * free.
 */

import type { PredictionHorizon } from '../prediction/prediction.dto';
import type { AgentScope } from './agent.types';

/** Three-band congestion state shared with the prediction snapshot. */
export type HeatTrafficState = 'smooth' | 'pressure' | 'congestion';

export interface GeoPoint {
  lat: number;
  lng: number;
}

// ───────────────────────── heatmap ─────────────────────────

/**
 * One intersection-level heat cell. Field names mirror the frontend
 * `CommandPredictionHeatPoint` so the command map can consume the
 * payload without a translation layer.
 */
export interface HeatPoint {
  id: string;
  intersectionId: string;
  label: string;
  location: GeoPoint;
  trafficState: HeatTrafficState;
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
  /** Normalised pressure 0..1 — handy for opacity / colour ramps. */
  intensity: number;
  /** Render radius in metres (matches the existing circle layer). */
  radiusMetres: number;
}

/**
 * One road-link heat segment (the "coloured roads" granularity).
 * Geometry comes straight from the road-link record; intensity is the
 * stronger of its two endpoints, lifted by the link's spillback risk.
 */
export interface HeatSegment {
  id: string;
  fromIntersectionId: string;
  toIntersectionId: string;
  from: GeoPoint;
  to: GeoPoint;
  trafficState: HeatTrafficState;
  intensity: number;
  spillbackRisk: number | null;
  distanceMetres: number | null;
}

export interface HeatmapPayload {
  scope: AgentScope;
  scopeRef: string;
  horizon: PredictionHorizon;
  generatedAt: string;
  pointCount: number;
  segmentCount: number;
  points: HeatPoint[];
  segments: HeatSegment[];
  hottest: { intersectionId: string; label: string; intensity: number } | null;
}

// ──────────────────── anticipation (Waze-style) ────────────────────

/** Why traffic is building — the causal taxonomy the agent attributes. */
export type AnticipationCauseType =
  | 'recurring_time_pattern'
  | 'upstream_propagation'
  | 'equipment_fault'
  | 'special_event'
  | 'weather'
  | 'live_traffic';

export interface AnticipationCause {
  type: AnticipationCauseType;
  /** Short human label, e.g. "Heure de pointe du matin". */
  label: string;
  /** One sentence explaining the attribution. */
  detail: string;
  /** Relative contribution 0..1 — lets the UI rank causes. */
  weight: number;
}

/**
 * A single anticipation card. Mirrors the frontend
 * `CommandPredictionInsight` (id/emoji/title/summary/detail/location/
 * trafficState) and adds the structured foresight fields.
 */
export interface TrafficInsight {
  id: string;
  emoji: string;
  title: string;
  summary: string;
  detail: string;
  location: GeoPoint;
  trafficState: HeatTrafficState;
  /** State the agent expects at `leadTimeMinutes` from now. */
  anticipatedState: HeatTrafficState;
  leadTimeMinutes: number;
  confidence: number;
  saturationForecast: number;
  causes: AnticipationCause[];
}

export interface AnticipationPayload {
  scope: AgentScope;
  scopeRef: string;
  horizon: PredictionHorizon;
  generatedAt: string;
  leadTimeMinutes: number;
  insightCount: number;
  insights: TrafficInsight[];
  /** Count of insights each cause type contributed to. */
  causeSummary: Partial<Record<AnticipationCauseType, number>>;
  /** Provenance of the live-traffic enrichment for the top hotspot. */
  liveTrafficSource: 'google' | 'fallback' | 'disabled' | 'none';
}
