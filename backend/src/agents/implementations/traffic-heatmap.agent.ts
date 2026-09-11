import { Injectable } from '@nestjs/common';

import { IntersectionsService } from '../../intersections/intersections.service';
import { RoadLinksService } from '../../road-links/road-links.service';
import type { AgentExecutionContext } from '../agent-execution.context';
import type { Agent } from '../agent-registry.service';
import type { AgentDecision, AgentScope, AgentSeverity } from '../agent.types';
import type {
  GeoPoint,
  HeatPoint,
  HeatSegment,
  HeatmapPayload,
  HeatTrafficState,
} from '../agent-visualization.types';

/**
 * TrafficHeatmapAgent — turns the city/zone forecast into a renderable
 * heat layer at two granularities:
 *
 *  • points   — one cell per intersection, intensity from forecast
 *               saturation + queue + delay.
 *  • segments — one cell per road link, intensity = the stronger of
 *               its two endpoints, lifted by the link spillback risk.
 *
 * It does no control: the decision is `heatmap`, severity reflects the
 * worst cell, and the actual layer rides in `decision.payload` for the
 * command map to draw directly.
 */
@Injectable()
export class TrafficHeatmapAgent implements Agent {
  readonly id = 'traffic-heatmap';
  readonly type = 'visualization';
  readonly scopes: AgentScope[] = ['city', 'zone'];
  readonly description =
    'Builds a network heat layer (intersection points + road-link segments) from the forecast.';
  readonly priority = 70;

  constructor(
    private readonly intersections: IntersectionsService,
    private readonly roadLinks: RoadLinksService,
  ) {}

  async run(context: AgentExecutionContext): Promise<AgentDecision | null> {
    const snapshot = await context.getScopeSnapshot();
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

    const points: HeatPoint[] = [];
    const intensityByCode = new Map<string, number>();
    const stateByCode = new Map<string, HeatTrafficState>();

    for (const hotspot of snapshot.hotspots) {
      const location = locationByCode.get(hotspot.intersectionId);
      if (!location) continue; // no coordinates → can't place on the map

      const intensity = heatIntensity(
        hotspot.saturationForecast,
        hotspot.queueLengthForecast,
        hotspot.delaySecondsForecast,
      );
      intensityByCode.set(hotspot.intersectionId, intensity);
      stateByCode.set(hotspot.intersectionId, hotspot.trafficState);

      points.push({
        id: `hotspot-${hotspot.intersectionId}`,
        intersectionId: hotspot.intersectionId,
        label: hotspot.label,
        location,
        trafficState: hotspot.trafficState,
        saturationForecast: round2(hotspot.saturationForecast),
        queueLengthForecast: Math.round(hotspot.queueLengthForecast),
        delaySecondsForecast: Math.round(hotspot.delaySecondsForecast),
        confidence: round2(hotspot.confidence),
        intensity: round2(intensity),
        radiusMetres: heatRadiusMetres(
          hotspot.saturationForecast,
          hotspot.queueLengthForecast,
          hotspot.delaySecondsForecast,
        ),
      });
    }

    points.sort((left, right) => right.intensity - left.intensity);

    const segments: HeatSegment[] = [];
    for (const link of links) {
      const fromIntensity = intensityByCode.get(link.fromIntersectionId);
      const toIntensity = intensityByCode.get(link.toIntersectionId);
      // Only draw a segment when at least one endpoint is in the
      // forecast — otherwise we have no pressure value for it.
      if (fromIntensity == null && toIntensity == null) continue;

      const spillback = link.queueSpillbackRisk;
      const base = Math.max(fromIntensity ?? 0, toIntensity ?? 0);
      const intensity = clamp(
        base + (spillback != null ? spillback * 0.15 : 0),
        0,
        1,
      );
      const state = worseState(
        stateByCode.get(link.fromIntersectionId) ?? 'smooth',
        stateByCode.get(link.toIntersectionId) ?? 'smooth',
      );

      segments.push({
        id: `link-${link.id}`,
        fromIntersectionId: link.fromIntersectionId,
        toIntersectionId: link.toIntersectionId,
        from: { lat: link.fromLat, lng: link.fromLng },
        to: { lat: link.toLat, lng: link.toLng },
        trafficState: state,
        intensity: round2(intensity),
        spillbackRisk: spillback != null ? round2(spillback) : null,
        distanceMetres: link.distanceMetres,
      });
    }

    segments.sort((left, right) => right.intensity - left.intensity);

    const hottest = points[0]
      ? {
          intersectionId: points[0].intersectionId,
          label: points[0].label,
          intensity: points[0].intensity,
        }
      : null;

    const payload: HeatmapPayload = {
      scope: context.scope,
      scopeRef: context.scopeRef,
      horizon: context.horizon,
      generatedAt: new Date().toISOString(),
      pointCount: points.length,
      segmentCount: segments.length,
      points,
      segments,
      hottest,
    };

    const severity = heatSeverity(points);
    const rationale = buildRationale(snapshot.label, points, segments, hottest);

    return {
      kind: 'heatmap',
      severity,
      rationale,
      payload: payload as unknown as Record<string, unknown>,
    };
  }
}

// ───────────────────────── helpers ─────────────────────────

/** Same blend the command map used client-side, normalised to 0..1. */
function heatIntensity(
  saturation: number,
  queueMetres: number,
  delaySeconds: number,
): number {
  const saturationComponent = Math.min(saturation / 1.2, 1) * 0.5;
  const queueComponent = Math.min(queueMetres / 200, 1) * 0.25;
  const delayComponent = Math.min(delaySeconds / 120, 1) * 0.25;
  return clamp(saturationComponent + queueComponent + delayComponent, 0, 1);
}

/** Mirrors the existing CircleF radius formula in command-platform.tsx. */
function heatRadiusMetres(
  saturation: number,
  queueMetres: number,
  delaySeconds: number,
): number {
  return Math.round(
    clamp(queueMetres * 3 + delaySeconds * 1.15 + saturation * 110, 140, 520),
  );
}

function heatSeverity(points: HeatPoint[]): AgentSeverity {
  if (points.length === 0) return 'info';
  if (points.some((point) => point.trafficState === 'congestion')) {
    return 'warning';
  }
  if (points.some((point) => point.trafficState === 'pressure')) {
    return 'advisory';
  }
  return 'info';
}

function buildRationale(
  scopeLabel: string,
  points: HeatPoint[],
  segments: HeatSegment[],
  hottest: HeatmapPayload['hottest'],
): string[] {
  if (points.length === 0) {
    return [
      `${scopeLabel}: no intersections with coordinates and a forecast — heat layer is empty.`,
    ];
  }
  const congestion = points.filter(
    (point) => point.trafficState === 'congestion',
  ).length;
  const pressure = points.filter(
    (point) => point.trafficState === 'pressure',
  ).length;
  const rationale = [
    `${scopeLabel}: ${points.length} heat point(s), ${segments.length} road segment(s).`,
    `${congestion} in congestion, ${pressure} under pressure.`,
  ];
  if (hottest) {
    rationale.push(
      `Hottest: ${hottest.label} (intensity ${hottest.intensity.toFixed(2)}).`,
    );
  }
  return rationale;
}

function worseState(
  a: HeatTrafficState,
  b: HeatTrafficState,
): HeatTrafficState {
  const rank: Record<HeatTrafficState, number> = {
    smooth: 0,
    pressure: 1,
    congestion: 2,
  };
  return rank[a] >= rank[b] ? a : b;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
