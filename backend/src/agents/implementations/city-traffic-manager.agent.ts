import { Injectable } from '@nestjs/common';

import type { AgentExecutionContext } from '../agent-execution.context';
import type { Agent } from '../agent-registry.service';
import type { AgentDecision, AgentScope, AgentSeverity } from '../agent.types';

const HOTSPOT_SAT_THRESHOLD = 0.85;
const SCOPE_PRESSURE_THRESHOLD = 0.7;
const SCOPE_CONGESTION_THRESHOLD = 0.9;
/**
 * Saturation floor used to flag an intersection as "actionable" — the
 * scheduler reads `actionableIntersectionCodes` from the agent payload
 * to decide which intersections to dive into next tick. Lower than the
 * hotspot threshold so we don't miss the pressure band (0.7 – 0.85).
 */
const ACTIONABLE_SAT_THRESHOLD = 0.7;

function getForecastSaturation(entry: {
  saturationForecast: number;
}): number {
  return entry.saturationForecast ?? 0;
}

function buildHotspotReasons(entry: {
  trafficState: 'smooth' | 'pressure' | 'congestion';
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  equipmentStatus: string;
}): string[] {
  const reasons: string[] = [];

  if (entry.trafficState === 'congestion') {
    reasons.push('forecast congestion state');
  } else if (entry.trafficState === 'pressure') {
    reasons.push('forecast pressure state');
  }

  if (entry.saturationForecast >= 1.2) {
    reasons.push(
      `critical forecast saturation (${entry.saturationForecast.toFixed(2)})`,
    );
  } else if (entry.saturationForecast >= HOTSPOT_SAT_THRESHOLD) {
    reasons.push(
      `high forecast saturation (${entry.saturationForecast.toFixed(2)})`,
    );
  }

  if (entry.queueLengthForecast >= 180) {
    reasons.push(
      `long queue forecast (${Math.round(entry.queueLengthForecast)} m)`,
    );
  } else if (entry.queueLengthForecast >= 90) {
    reasons.push(
      `elevated queue forecast (${Math.round(entry.queueLengthForecast)} m)`,
    );
  }

  if (entry.delaySecondsForecast >= 90) {
    reasons.push(
      `severe delay forecast (${Math.round(entry.delaySecondsForecast)} s)`,
    );
  } else if (entry.delaySecondsForecast >= 45) {
    reasons.push(
      `elevated delay forecast (${Math.round(entry.delaySecondsForecast)} s)`,
    );
  }

  if (entry.equipmentStatus && entry.equipmentStatus !== 'Équipé en service') {
    reasons.push(`equipment status: ${entry.equipmentStatus}`);
  }

  return reasons;
}

function recommendHotspotAction(entry: {
  trafficState: 'smooth' | 'pressure' | 'congestion';
  equipmentStatus: string;
  saturationForecast: number;
}): string {
  if (entry.equipmentStatus && entry.equipmentStatus !== 'Équipé en service') {
    return 'inspect_controller';
  }
  if (
    entry.trafficState === 'congestion' ||
    entry.saturationForecast >= SCOPE_CONGESTION_THRESHOLD
  ) {
    return 'dispatch_operator';
  }
  if (
    entry.trafficState === 'pressure' ||
    entry.saturationForecast >= SCOPE_PRESSURE_THRESHOLD
  ) {
    return 'coordinate_corridor';
  }
  return 'monitor';
}

/**
 * CityTrafficManagerAgent — strategic agent for a whole city/zone.
 *
 * Aggregates hotspots, identifies pressure points, and emits a
 * global strategy: stable / coordinate / dispatch. Reads the scope
 * snapshot (which already includes per-intersection metrics +
 * per-intersection forecast) and applies operations-grade rules.
 */
@Injectable()
export class CityTrafficManagerAgent implements Agent {
  readonly id = 'city-traffic-manager';
  readonly type = 'global-strategy';
  readonly scopes: AgentScope[] = ['city', 'zone'];
  readonly description =
    'Detects hotspots across a city/zone and proposes a global strategy.';
  readonly priority = 50;

  async run(context: AgentExecutionContext): Promise<AgentDecision | null> {
    const snapshot = await context.getScopeSnapshot();
    const aggregated = snapshot.aggregatedMetrics;

    // Loud "blind" branch: if the snapshot has no hotspots AND no
    // aggregated metrics, the system has no real data on this scope.
    // Return data_unavailable as a warning so operators see a visible
    // signal — never silently emit `maintain_global` "smooth", which
    // would falsely reassure them.
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
          `${context.scope}/${context.scopeRef}: no engineering metrics or forecasts available.`,
          'System is blind — do NOT assume traffic is smooth. Verify topology mapping and detector feeds before relying on agent output for this scope.',
        ],
        payload: {
          scope: context.scope,
          scopeRef: context.scopeRef,
          reason: 'no_hotspots_no_aggregates',
          actionableIntersectionCodes: [],
        },
      };
    }

    const hotspots = snapshot.hotspots
      .filter((entry) => {
        const sat = getForecastSaturation(entry);
        return sat >= HOTSPOT_SAT_THRESHOLD;
      })
      .sort(
        (a, b) => getForecastSaturation(b) - getForecastSaturation(a),
      )
      .slice(0, 5);

    const congestionCount = snapshot.hotspots.filter(
      (entry) => entry.trafficState === 'congestion',
    ).length;
    const pressureCount = snapshot.hotspots.filter(
      (entry) => entry.trafficState === 'pressure',
    ).length;

    // Wider net than `topHotspots` — anything in pressure or above, or
    // sat >= 0.7, is a candidate for an intersection-scope agent dive
    // next tick. The scheduler reads this from the payload.
    const actionableIntersectionCodes = Array.from(
      new Set(
        snapshot.hotspots
          .filter((entry) => {
            const sat = getForecastSaturation(entry);
            return (
              entry.trafficState !== 'smooth' || sat >= ACTIONABLE_SAT_THRESHOLD
            );
          })
          .sort(
            (a, b) =>
              getForecastSaturation(b) - getForecastSaturation(a),
          )
          .map((entry) => entry.intersectionId),
      ),
    );

    const rationale: string[] = [];
    rationale.push(
      `${snapshot.hotspots.length} intersection(s) sampled — ` +
        `${congestionCount} congestion, ${pressureCount} pressure.`,
    );
    if (aggregated.averageSaturation != null) {
      rationale.push(
        `Aggregated saturation X̄ = ${aggregated.averageSaturation.toFixed(2)}.`,
      );
    }
    if (aggregated.totalQueueLengthMetres != null) {
      rationale.push(
        `Total queue across hotspots: ${Math.round(aggregated.totalQueueLengthMetres)} m.`,
      );
    }
    if (aggregated.averageDelaySeconds != null) {
      rationale.push(
        `Average delay: ${Math.round(aggregated.averageDelaySeconds)} s.`,
      );
    }
    rationale.push(
      `Top hotspots: ${
        hotspots.length === 0
          ? 'none above threshold'
          : hotspots
              .map((h) => `${h.label} (X=${h.saturationForecast.toFixed(2)})`)
              .join('; ')
      }`,
    );

    const congestionLevel = snapshot.congestionLevel;
    const sat = aggregated.averageSaturation ?? 0;

    let kind: string;
    let severity: AgentSeverity;
    if (
      congestionLevel === 'congestion' ||
      sat >= SCOPE_CONGESTION_THRESHOLD ||
      congestionCount >= 2
    ) {
      kind = 'dispatch_global';
      severity = 'critical';
      rationale.push(
        'Multiple hotspots — recommend dispatching operators / police to top intersections and re-coordinating corridors.',
      );
    } else if (
      congestionLevel === 'pressure' ||
      sat >= SCOPE_PRESSURE_THRESHOLD ||
      pressureCount >= 3 ||
      hotspots.length >= 1
    ) {
      kind = 'coordinate_corridors';
      severity = 'warning';
      rationale.push(
        'Pressure points detected — bias green at the top hotspots and tighten cycle coordination on the affected corridor.',
      );
    } else {
      kind = 'maintain_global';
      severity = 'info';
      rationale.push(
        'Network is stable — keep current scenario, monitor evolution.',
      );
    }

    return {
      kind,
      severity,
      rationale,
      payload: {
        scope: context.scope,
        scopeRef: context.scopeRef,
        aggregatedMetrics: aggregated,
        congestionLevel,
        hotspotCount: snapshot.hotspots.length,
        congestionCount,
        pressureCount,
        topHotspots: hotspots.map((entry) => ({
          intersectionId: entry.intersectionId,
          controllerId: null,
          label: entry.label,
          district: entry.district,
          trafficState: entry.trafficState,
          equipmentStatus: entry.equipmentStatus,
          saturationForecast: entry.saturationForecast,
          queueLengthForecast: entry.queueLengthForecast,
          delaySecondsForecast: entry.delaySecondsForecast,
          confidence: entry.confidence,
          rankingFactors: buildHotspotReasons(entry),
          reasons: buildHotspotReasons(entry),
          recommendedAction: recommendHotspotAction(entry),
        })),
        actionableIntersectionCodes,
      },
    };
  }
}
