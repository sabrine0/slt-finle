import { Injectable, Logger } from '@nestjs/common';

import { IntersectionsService } from '../../intersections/intersections.service';
import type { ScopePredictionHotspot } from '../../prediction-snapshots/prediction-snapshots.service';
import { RoadLinksService } from '../../road-links/road-links.service';
import type { PredictionHorizon } from '../../prediction/prediction.dto';
import { TrafficIntelligenceService } from '../../traffic-intelligence/traffic-intelligence.service';
import type { GoogleTrafficCorridor } from '../../traffic-intelligence/traffic-intelligence.types';
import type { AgentExecutionContext } from '../agent-execution.context';
import type { Agent } from '../agent-registry.service';
import type { AgentDecision, AgentScope, AgentSeverity } from '../agent.types';
import type {
  AnticipationCause,
  AnticipationCauseType,
  AnticipationPayload,
  GeoPoint,
  HeatTrafficState,
  TrafficInsight,
} from '../agent-visualization.types';
import { ContextSignalsProvider } from '../context-signals.provider';

/** Sentinel the platform uses for a healthy controller. */
const EQUIPMENT_OK = 'Équipé en service';
/** Saturation at/above which a node is worth explaining even if "smooth". */
const ACTIONABLE_SATURATION = 0.7;
/** How many hotspot cards to build per run. */
const MAX_HOTSPOT_INSIGHTS = 6;
/** Event marker within this distance of a hotspot counts as its cause. */
const EVENT_PROXIMITY_METRES = 3000;

/**
 * TrafficAnticipationAgent — the "Waze-style" foresight agent.
 *
 * It reads what is happening across the city/zone right now (current
 * metrics), what is expected at the forecast horizon (the hotspot
 * states), and explains *why* each pressure point is building by
 * attributing causes:
 *
 *   • recurring_time_pattern — commute / rush windows
 *   • upstream_propagation   — queue spilling back from a neighbour
 *   • equipment_fault        — a controller not in service
 *   • special_event / weather — ambient signals (ContextSignalsProvider)
 *   • live_traffic           — Google live corridor delay on the top node
 *
 * Output is a list of geo-located insight cards plus the structured
 * `rationale[]` the agent framework expects. No control is issued.
 */
@Injectable()
export class TrafficAnticipationAgent implements Agent {
  readonly id = 'traffic-anticipation';
  readonly type = 'foresight';
  readonly scopes: AgentScope[] = ['city', 'zone'];
  readonly description =
    'Anticipates where traffic will build and explains why (time, upstream spillback, equipment, events, live traffic).';
  readonly priority = 60;

  private readonly logger = new Logger(TrafficAnticipationAgent.name);

  constructor(
    private readonly intersections: IntersectionsService,
    private readonly roadLinks: RoadLinksService,
    private readonly trafficIntelligence: TrafficIntelligenceService,
    private readonly contextSignals: ContextSignalsProvider,
  ) {}

  async run(context: AgentExecutionContext): Promise<AgentDecision | null> {
    const snapshot = await context.getScopeSnapshot();
    const aggregated = snapshot.aggregatedMetrics;

    // Blind branch — mirror CityTrafficManagerAgent: never silently
    // report "all clear" when we simply have no data on this scope.
    if (
      snapshot.hotspots.length === 0 &&
      aggregated.averageSaturation == null &&
      aggregated.totalQueueLengthMetres == null &&
      aggregated.averageDelaySeconds == null
    ) {
      return {
        kind: 'data_unavailable',
        severity: 'warning',
        rationale: [
          `${context.scope}/${context.scopeRef}: no metrics or forecasts — cannot anticipate traffic.`,
          'System is blind here — verify topology mapping and detector feeds before trusting anticipation output.',
        ],
        payload: { scope: context.scope, scopeRef: context.scopeRef },
      };
    }

    const scopeFilter =
      context.scope === 'zone'
        ? { zoneId: context.scopeRef }
        : { cityId: context.scopeRef };
    const [directory, links] = await Promise.all([
      this.intersections.list(scopeFilter),
      this.roadLinks.list(scopeFilter),
    ]);

    const locationByCode = new Map<string, GeoPoint>();
    for (const node of directory) {
      locationByCode.set(node.code, {
        lat: node.latitude,
        lng: node.longitude,
      });
    }
    const center = meanCenter([...locationByCode.values()]);

    // Upstream adjacency: for each node, which neighbours feed into it.
    const incomingByCode = new Map<
      string,
      Array<{ from: string; spillbackRisk: number | null }>
    >();
    for (const link of links) {
      const list = incomingByCode.get(link.toIntersectionId) ?? [];
      list.push({
        from: link.fromIntersectionId,
        spillbackRisk: link.queueSpillbackRisk,
      });
      incomingByCode.set(link.toIntersectionId, list);
    }

    const hotspotByCode = new Map<string, ScopePredictionHotspot>();
    for (const hotspot of snapshot.hotspots) {
      hotspotByCode.set(hotspot.intersectionId, hotspot);
    }

    const now = new Date();
    const leadTimeMinutes = horizonLeadMinutes(context.horizon);
    const timeCause = recurringTimeCause(now);
    const signals = await this.contextSignals.getSignals({
      cityId: context.scope === 'city' ? context.scopeRef : '',
      cityName: snapshot.label,
      now,
      center,
    });

    // Rank candidates: anything not smooth, or saturated enough to matter.
    const candidates = snapshot.hotspots
      .filter(
        (hotspot) =>
          hotspot.trafficState !== 'smooth' ||
          hotspot.saturationForecast >= ACTIONABLE_SATURATION,
      )
      .sort((a, b) => urgency(b) - urgency(a))
      .slice(0, MAX_HOTSPOT_INSIGHTS);

    // Live-traffic enrichment for the single top node only (≤1 Google call).
    let liveTrafficSource: AnticipationPayload['liveTrafficSource'] = 'none';
    let liveTopCorridor: GoogleTrafficCorridor | null = null;
    const topCandidate = candidates[0];
    if (topCandidate) {
      try {
        const ctx = await this.trafficIntelligence.getContext(
          topCandidate.intersectionId,
        );
        liveTrafficSource = ctx.googleTraffic.source;
        liveTopCorridor = worstCorridor(ctx.googleTraffic.corridors);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown error';
        this.logger.debug(
          `Live-traffic context unavailable for ${topCandidate.intersectionId}: ${message}`,
        );
        liveTrafficSource = 'none';
      }
    }

    const insights: TrafficInsight[] = [];
    const causeSummary: Partial<Record<AnticipationCauseType, number>> = {};
    const noteCause = (type: AnticipationCauseType) => {
      causeSummary[type] = (causeSummary[type] ?? 0) + 1;
    };

    for (const hotspot of candidates) {
      const location = locationByCode.get(hotspot.intersectionId);
      if (!location) continue;

      const causes: AnticipationCause[] = [];

      // 1. recurring time pattern
      if (timeCause && hotspot.trafficState !== 'smooth') {
        causes.push(timeCause);
      }

      // 2. upstream propagation
      const upstream = (incomingByCode.get(hotspot.intersectionId) ?? [])
        .map((edge) => ({ edge, neighbour: hotspotByCode.get(edge.from) }))
        .filter(
          (entry) =>
            entry.neighbour &&
            (entry.neighbour.trafficState !== 'smooth' ||
              entry.neighbour.saturationForecast >= ACTIONABLE_SATURATION),
        )
        .sort(
          (a, b) =>
            (b.neighbour?.saturationForecast ?? 0) -
            (a.neighbour?.saturationForecast ?? 0),
        )[0];
      if (upstream?.neighbour) {
        const risk = upstream.edge.spillbackRisk;
        causes.push({
          type: 'upstream_propagation',
          label: `Remontée de file depuis ${upstream.neighbour.label}`,
          detail: `${upstream.neighbour.label} est en ${stateFr(upstream.neighbour.trafficState)} (X=${upstream.neighbour.saturationForecast.toFixed(2)})${
            risk != null ? `, risque de remontée ${(risk * 100).toFixed(0)}%` : ''
          }.`,
          weight: clamp(
            (risk ?? 0.4) * 0.6 + upstream.neighbour.saturationForecast * 0.4,
            0,
            1,
          ),
        });
      }

      // 3. equipment fault
      if (hotspot.equipmentStatus && hotspot.equipmentStatus !== EQUIPMENT_OK) {
        causes.push({
          type: 'equipment_fault',
          label: 'Équipement dégradé',
          detail: `Statut contrôleur: ${hotspot.equipmentStatus} — capacité réduite tant que non rétabli.`,
          weight: 0.7,
        });
      }

      // 4. special event (when an event marker is near this node)
      const nearEvent = signals.events.find(
        (event) =>
          haversineMetres(location, event.location) <= EVENT_PROXIMITY_METRES,
      );
      if (nearEvent) {
        causes.push({
          type: 'special_event',
          label: nearEvent.title,
          detail: `Événement à proximité — demande additionnelle estimée (heuristique, source: ${signals.source}).`,
          weight: clamp(nearEvent.expectedImpact, 0, 1),
        });
      }

      // 5. live traffic — top node only
      if (
        hotspot === topCandidate &&
        liveTopCorridor &&
        corridorRank(liveTopCorridor.congestionLevel) >= corridorRank('moderate')
      ) {
        causes.push({
          type: 'live_traffic',
          label: `Trafic live ${liveTopCorridor.congestionLevel}`,
          detail: `Google: approche ${liveTopCorridor.label} à ×${liveTopCorridor.delayFactor.toFixed(2)} du temps libre (source: ${liveTrafficSource}).`,
          weight: clamp(liveTopCorridor.delayFactor - 1, 0, 1),
        });
      }

      for (const cause of causes) noteCause(cause.type);

      insights.push(
        buildHotspotInsight(hotspot, location, leadTimeMinutes, causes),
      );
    }

    // Ambient cards not tied to a single hotspot — event + weather.
    for (const event of signals.events) {
      // Skip if already attributed to a nearby hotspot above.
      const attributed = insights.some((insight) =>
        insight.causes.some(
          (cause) => cause.type === 'special_event' && cause.label === event.title,
        ),
      );
      if (attributed) continue;
      noteCause('special_event');
      insights.push({
        id: `insight-${event.id}`,
        emoji: '⚽',
        title: event.title,
        summary: `${snapshot.label}: hausse de charge possible autour des grands axes en soirée d'événement.`,
        detail: `Signal heuristique (source: ${signals.source}) — connecter un calendrier réel affichera équipes, stade et horaire.`,
        location: event.location,
        trafficState: 'pressure',
        anticipatedState: 'pressure',
        leadTimeMinutes,
        confidence: 0.4,
        saturationForecast: 0,
        causes: [
          {
            type: 'special_event',
            label: event.title,
            detail: 'Événement programmé / probable dans la fenêtre horaire.',
            weight: clamp(event.expectedImpact, 0, 1),
          },
        ],
      });
    }
    if (signals.weather && signals.weather.impact !== 'none' && center) {
      noteCause('weather');
      insights.push({
        id: 'insight-weather',
        emoji: '🌧️',
        title: signals.weather.description,
        summary: `${snapshot.label}: la météo dégrade le débit sur l'ensemble du réseau.`,
        detail: `Condition: ${signals.weather.condition} — impact ${signals.weather.impact}.`,
        location: center,
        trafficState: signals.weather.impact === 'major' ? 'congestion' : 'pressure',
        anticipatedState:
          signals.weather.impact === 'major' ? 'congestion' : 'pressure',
        leadTimeMinutes,
        confidence: 0.5,
        saturationForecast: 0,
        causes: [
          {
            type: 'weather',
            label: signals.weather.description,
            detail: `Impact météo ${signals.weather.impact}.`,
            weight: signals.weather.impact === 'major' ? 0.8 : 0.4,
          },
        ],
      });
    }

    const worst = worstAnticipated(insights);
    const { kind, severity } = classify(insights, worst);
    const rationale = buildRationale(snapshot.label, insights, leadTimeMinutes);

    const payload: AnticipationPayload = {
      scope: context.scope,
      scopeRef: context.scopeRef,
      horizon: context.horizon,
      generatedAt: new Date().toISOString(),
      leadTimeMinutes,
      insightCount: insights.length,
      insights,
      causeSummary,
      liveTrafficSource,
    };

    return {
      kind,
      severity,
      rationale,
      payload: payload as unknown as Record<string, unknown>,
    };
  }
}

// ───────────────────────── helpers ─────────────────────────

function buildHotspotInsight(
  hotspot: ScopePredictionHotspot,
  location: GeoPoint,
  leadTimeMinutes: number,
  causes: AnticipationCause[],
): TrafficInsight {
  const currentSaturation = hotspot.metrics.saturation ?? null;
  const trend =
    currentSaturation == null
      ? 'stable'
      : hotspot.saturationForecast > currentSaturation + 0.05
        ? 'worsening'
        : hotspot.saturationForecast < currentSaturation - 0.05
          ? 'improving'
          : 'stable';

  const topCause = [...causes].sort((a, b) => b.weight - a.weight)[0];
  const why = causes.length
    ? causes.map((cause) => cause.label).join(' · ')
    : 'évolution normale du trafic';

  return {
    id: `insight-hotspot-${hotspot.intersectionId}`,
    emoji: emojiFor(hotspot.trafficState),
    title: `${hotspot.label} — ${stateFr(hotspot.trafficState)} prévu`,
    summary: `H+${leadTimeMinutes}: ${hotspot.label} ${trendFr(trend)} (X=${hotspot.saturationForecast.toFixed(2)}, file ${Math.round(hotspot.queueLengthForecast)} m, délai ${Math.round(hotspot.delaySecondsForecast)} s).`,
    detail: `Cause principale: ${topCause ? topCause.label : 'aucune attribuée'}. Facteurs: ${why}.`,
    location,
    trafficState: hotspot.trafficState,
    anticipatedState: hotspot.trafficState,
    leadTimeMinutes,
    confidence: round2(hotspot.confidence),
    saturationForecast: round2(hotspot.saturationForecast),
    causes,
  };
}

function recurringTimeCause(now: Date): AnticipationCause | null {
  const day = now.getDay(); // 0 = Sunday
  const hour = now.getHours();
  const weekday = day >= 1 && day <= 5;
  if (weekday && hour >= 7 && hour < 10) {
    return {
      type: 'recurring_time_pattern',
      label: 'Heure de pointe du matin',
      detail:
        'En semaine 7h–10h, les flux domicile-travail chargent les axes d’entrée et les accès centres-villes.',
      weight: 0.6,
    };
  }
  if (weekday && hour >= 16 && hour < 20) {
    return {
      type: 'recurring_time_pattern',
      label: 'Retour du soir',
      detail:
        'En semaine 16h–20h, les retours domicile et les déposes scolaires reportent la charge sur les sorties.',
      weight: 0.6,
    };
  }
  if (!weekday && hour >= 11 && hour < 14) {
    return {
      type: 'recurring_time_pattern',
      label: 'Pic de mi-journée (week-end)',
      detail: 'Le week-end, la mi-journée concentre les déplacements de loisir.',
      weight: 0.4,
    };
  }
  return null;
}

function horizonLeadMinutes(horizon: PredictionHorizon): number {
  const match = /H\+(\d+)/.exec(String(horizon));
  return match ? Number(match[1]) : 15;
}

function urgency(hotspot: ScopePredictionHotspot): number {
  return (
    hotspot.saturationForecast * 100 +
    hotspot.queueLengthForecast +
    hotspot.delaySecondsForecast
  );
}

function worstCorridor(
  corridors: GoogleTrafficCorridor[],
): GoogleTrafficCorridor | null {
  if (corridors.length === 0) return null;
  return [...corridors].sort(
    (a, b) =>
      corridorRank(b.congestionLevel) - corridorRank(a.congestionLevel) ||
      b.delayFactor - a.delayFactor,
  )[0];
}

function corridorRank(level: GoogleTrafficCorridor['congestionLevel']): number {
  return { free: 0, light: 1, moderate: 2, heavy: 3, severe: 4 }[level];
}

function worstAnticipated(insights: TrafficInsight[]): HeatTrafficState {
  let worst: HeatTrafficState = 'smooth';
  for (const insight of insights) {
    if (stateRank(insight.anticipatedState) > stateRank(worst)) {
      worst = insight.anticipatedState;
    }
  }
  return worst;
}

function classify(
  insights: TrafficInsight[],
  worst: HeatTrafficState,
): { kind: string; severity: AgentSeverity } {
  if (insights.length === 0) {
    return { kind: 'all_clear', severity: 'info' };
  }
  const congestionCount = insights.filter(
    (insight) => insight.anticipatedState === 'congestion',
  ).length;
  if (worst === 'congestion') {
    return {
      kind: 'anticipate_congestion',
      severity: congestionCount >= 2 ? 'critical' : 'warning',
    };
  }
  if (worst === 'pressure') {
    return { kind: 'anticipate_pressure', severity: 'advisory' };
  }
  return { kind: 'all_clear', severity: 'info' };
}

function buildRationale(
  scopeLabel: string,
  insights: TrafficInsight[],
  leadTimeMinutes: number,
): string[] {
  if (insights.length === 0) {
    return [
      `${scopeLabel}: no pressure points anticipated at H+${leadTimeMinutes} — network expected to stay smooth.`,
    ];
  }
  const rationale = insights.slice(0, 4).map((insight) => {
    const top = [...insight.causes].sort((a, b) => b.weight - a.weight)[0];
    return `${insight.title} (H+${leadTimeMinutes}) — ${top ? top.label : 'cause non attribuée'}.`;
  });
  rationale.push(
    `${insights.length} anticipation card(s) generated for ${scopeLabel}.`,
  );
  return rationale;
}

function meanCenter(points: GeoPoint[]): GeoPoint | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

function haversineMetres(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function emojiFor(state: HeatTrafficState): string {
  return state === 'congestion' ? '🚧' : state === 'pressure' ? '🚦' : '✅';
}

function stateFr(state: HeatTrafficState): string {
  return state === 'congestion'
    ? 'congestion'
    : state === 'pressure'
      ? 'tension'
      : 'fluide';
}

function trendFr(trend: 'improving' | 'stable' | 'worsening'): string {
  return trend === 'worsening'
    ? 'se dégrade'
    : trend === 'improving'
      ? 's’améliore'
      : 'reste stable';
}

function stateRank(state: HeatTrafficState): number {
  return { smooth: 0, pressure: 1, congestion: 2 }[state];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
