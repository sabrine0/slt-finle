import type { IntersectionsService } from '../../intersections/intersections.service';
import type { RoadLinksService } from '../../road-links/road-links.service';
import type { TrafficIntelligenceService } from '../../traffic-intelligence/traffic-intelligence.service';
import {
  makeAggregated,
  makeContext,
  makeHotspot,
  makeMetrics,
  makeScopeSnapshot,
} from '../__tests__/agent-test-helpers';
import type { AnticipationPayload } from '../agent-visualization.types';
import { ContextSignalsProvider } from '../context-signals.provider';
import { TrafficAnticipationAgent } from './traffic-anticipation.agent';

function stubIntersections(
  rows: Array<{ code: string; latitude: number; longitude: number }>,
): IntersectionsService {
  return { list: jest.fn(async () => rows) } as unknown as IntersectionsService;
}

function stubRoadLinks(rows: unknown[]): RoadLinksService {
  return { list: jest.fn(async () => rows) } as unknown as RoadLinksService;
}

/** Live-traffic context that always fails — keeps tests offline. */
function stubTrafficIntelligence(): TrafficIntelligenceService {
  return {
    getContext: jest.fn(async () => {
      throw new Error('offline in test');
    }),
  } as unknown as TrafficIntelligenceService;
}

/** Context-signals provider that returns nothing (no events / weather). */
function quietSignals(): ContextSignalsProvider {
  return {
    getSignals: jest.fn(async () => ({
      events: [],
      weather: null,
      source: 'heuristic' as const,
    })),
  } as unknown as ContextSignalsProvider;
}

function makeAgent(
  overrides: {
    intersections?: IntersectionsService;
    roadLinks?: RoadLinksService;
    traffic?: TrafficIntelligenceService;
    signals?: ContextSignalsProvider;
  } = {},
): TrafficAnticipationAgent {
  return new TrafficAnticipationAgent(
    overrides.intersections ?? stubIntersections([]),
    overrides.roadLinks ?? stubRoadLinks([]),
    overrides.traffic ?? stubTrafficIntelligence(),
    overrides.signals ?? quietSignals(),
  );
}

describe('TrafficAnticipationAgent', () => {
  describe('metadata', () => {
    it('runs at city/zone scope with priority 60', () => {
      const agent = makeAgent();
      expect(agent.id).toBe('traffic-anticipation');
      expect(agent.type).toBe('foresight');
      expect(agent.scopes).toEqual(['city', 'zone']);
      expect(agent.priority).toBe(60);
    });
  });

  it('emits data_unavailable / warning when blind (no hotspots, no aggregates)', async () => {
    const agent = makeAgent();
    const context = makeContext({
      scope: 'zone',
      scopeRef: 'dist-x',
      scopeSnapshot: makeScopeSnapshot({
        scopeType: 'zone',
        scopeRef: 'dist-x',
        hotspots: [],
        averageSaturation: null,
        averageDelaySeconds: null,
        totalQueueMetres: null,
        aggregatedMetrics: makeAggregated({
          averageFlowVehiclesPerHour: null,
          averageDensityVehiclesPerKm: null,
          averageSpeedKph: null,
          totalQueueLengthMetres: null,
          averageDelaySeconds: null,
          averageSaturation: null,
          averageConfidence: null,
          sampleCount: 0,
        }),
      }),
    });

    const decision = await agent.run(context);
    expect(decision?.kind).toBe('data_unavailable');
    expect(decision?.severity).toBe('warning');
  });

  it('anticipates congestion and attributes equipment fault', async () => {
    const agent = makeAgent({
      intersections: stubIntersections([
        { code: 'INT-CAS-002', latitude: 33.59, longitude: -7.61 },
      ]),
    });
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        hotspots: [
          makeHotspot({
            intersectionId: 'INT-CAS-002',
            trafficState: 'congestion',
            equipmentStatus: 'Hors service',
            saturationForecast: 1.1,
            queueLengthForecast: 180,
            delaySecondsForecast: 100,
            metrics: makeMetrics({ saturation: 0.8 }),
          }),
        ],
      }),
    });

    const decision = await agent.run(context);
    const payload = decision?.payload as unknown as AnticipationPayload;

    expect(decision?.kind).toBe('anticipate_congestion');
    expect(payload.insightCount).toBe(1);
    expect(payload.insights[0].causes.map((cause) => cause.type)).toContain(
      'equipment_fault',
    );
    expect(payload.causeSummary.equipment_fault).toBe(1);
    expect(payload.liveTrafficSource).toBe('none');
  });

  it('attributes upstream propagation from a congested neighbour', async () => {
    const agent = makeAgent({
      intersections: stubIntersections([
        { code: 'DOWN', latitude: 33.6, longitude: -7.6 },
        { code: 'UP', latitude: 33.61, longitude: -7.61 },
      ]),
      roadLinks: stubRoadLinks([
        {
          id: 'l1',
          fromIntersectionId: 'UP',
          toIntersectionId: 'DOWN',
          fromLat: 33.61,
          fromLng: -7.61,
          toLat: 33.6,
          toLng: -7.6,
          queueSpillbackRisk: 0.7,
          distanceMetres: 300,
        },
      ]),
    });
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        hotspots: [
          makeHotspot({
            intersectionId: 'DOWN',
            label: 'Downstream',
            trafficState: 'pressure',
            saturationForecast: 0.85,
          }),
          makeHotspot({
            intersectionId: 'UP',
            label: 'Upstream',
            trafficState: 'congestion',
            saturationForecast: 1.0,
          }),
        ],
      }),
    });

    const decision = await agent.run(context);
    const payload = decision?.payload as unknown as AnticipationPayload;

    const downstream = payload.insights.find((insight) =>
      insight.id.includes('DOWN'),
    );
    expect(downstream?.causes.map((cause) => cause.type)).toContain(
      'upstream_propagation',
    );
  });

  it('stays all_clear / info when the network is smooth', async () => {
    const agent = makeAgent({
      intersections: stubIntersections([
        { code: 'INT-CAS-002', latitude: 33.59, longitude: -7.61 },
      ]),
    });
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        congestionLevel: 'smooth',
        averageSaturation: 0.4,
        hotspots: [
          makeHotspot({
            intersectionId: 'INT-CAS-002',
            trafficState: 'smooth',
            saturationForecast: 0.4,
          }),
        ],
      }),
    });

    const decision = await agent.run(context);
    expect(decision?.kind).toBe('all_clear');
    expect(decision?.severity).toBe('info');
  });
});
