import {
  makeAggregated,
  makeContext,
  makeHotspot,
  makeMetrics,
  makeScopeSnapshot,
} from '../__tests__/agent-test-helpers';
import { CityTrafficManagerAgent } from './city-traffic-manager.agent';

describe('CityTrafficManagerAgent', () => {
  const agent = new CityTrafficManagerAgent();

  describe('metadata', () => {
    it('runs at city/zone scope with priority 50', () => {
      expect(agent.id).toBe('city-traffic-manager');
      expect(agent.priority).toBe(50);
      expect(agent.scopes).toEqual(['city', 'zone']);
    });
  });

  it('returns maintain_global / info on a stable network', async () => {
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        congestionLevel: 'smooth',
        averageSaturation: 0.4,
        aggregatedMetrics: makeAggregated({ averageSaturation: 0.4 }),
        hotspots: [
          makeHotspot({ saturationForecast: 0.5, trafficState: 'smooth' }),
        ],
      }),
    });

    const decision = await agent.run(context);

    expect(decision?.kind).toBe('maintain_global');
    expect(decision?.severity).toBe('info');
  });

  it('emits data_unavailable / warning when the snapshot has no hotspots and no aggregates', async () => {
    const context = makeContext({
      scope: 'zone',
      scopeRef: 'dist-cas-sidi-belyout',
      scopeSnapshot: makeScopeSnapshot({
        scopeType: 'zone',
        scopeRef: 'dist-cas-sidi-belyout',
        congestionLevel: 'smooth',
        averageSaturation: null,
        averageDelaySeconds: null,
        averageConfidence: null,
        totalQueueMetres: null,
        aggregatedMetrics: makeAggregated({
          averageSaturation: null,
          averageDelaySeconds: null,
          averageConfidence: null,
          totalQueueLengthMetres: null,
          averageDensityVehiclesPerKm: null,
          averageFlowVehiclesPerHour: null,
          averageSpeedKph: null,
          totalCapacityVehiclesPerHour: null,
          totalQueueLengthVehicles: null,
          sampleCount: 0,
        }),
        hotspots: [],
      }),
    });

    const decision = await agent.run(context);

    expect(decision?.kind).toBe('data_unavailable');
    expect(decision?.severity).toBe('warning');
    expect(decision?.rationale.join(' ')).toMatch(/blind/i);
    expect(decision?.payload).toMatchObject({
      scope: 'zone',
      scopeRef: 'dist-cas-sidi-belyout',
      reason: 'no_hotspots_no_aggregates',
      actionableIntersectionCodes: [],
    });
  });

  it('exposes actionableIntersectionCodes for the scheduler — pressure or sat >= 0.7', async () => {
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        congestionLevel: 'pressure',
        averageSaturation: 0.65,
        aggregatedMetrics: makeAggregated({ averageSaturation: 0.65 }),
        hotspots: [
          makeHotspot({
            intersectionId: 'INT-LOW',
            saturationForecast: 0.55,
            trafficState: 'smooth',
          }),
          makeHotspot({
            intersectionId: 'INT-EDGE',
            saturationForecast: 0.7,
            trafficState: 'pressure',
          }),
          makeHotspot({
            intersectionId: 'INT-PRESS',
            saturationForecast: 0.78,
            trafficState: 'pressure',
          }),
          makeHotspot({
            intersectionId: 'INT-HOT',
            saturationForecast: 0.92,
            trafficState: 'congestion',
          }),
        ],
      }),
    });

    const decision = await agent.run(context);
    const actionable = decision?.payload?.[
      'actionableIntersectionCodes'
    ] as string[];

    // INT-LOW excluded (smooth + sat 0.55). The other three included,
    // sorted by saturation descending.
    expect(actionable).toEqual(['INT-HOT', 'INT-PRESS', 'INT-EDGE']);
  });

  it('coordinates corridors when at least one hotspot crosses 0.85 saturation', async () => {
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        congestionLevel: 'pressure',
        averageSaturation: 0.65,
        aggregatedMetrics: makeAggregated({ averageSaturation: 0.65 }),
        hotspots: [
          makeHotspot({
            intersectionId: 'INT-A',
            saturationForecast: 0.88,
            trafficState: 'pressure',
          }),
          makeHotspot({
            intersectionId: 'INT-B',
            saturationForecast: 0.6,
            trafficState: 'smooth',
          }),
        ],
      }),
    });

    const decision = await agent.run(context);

    expect(decision?.kind).toBe('coordinate_corridors');
    expect(decision?.severity).toBe('warning');
    expect(decision?.payload?.['hotspotCount']).toBe(2);
    expect((decision?.payload?.['topHotspots'] as Array<unknown>).length).toBe(
      1,
    );
  });

  it('dispatches global response when 2+ congestion hotspots are detected', async () => {
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        congestionLevel: 'pressure',
        averageSaturation: 0.75,
        aggregatedMetrics: makeAggregated({ averageSaturation: 0.75 }),
        hotspots: [
          makeHotspot({
            intersectionId: 'INT-A',
            saturationForecast: 0.95,
            trafficState: 'congestion',
          }),
          makeHotspot({
            intersectionId: 'INT-B',
            saturationForecast: 0.92,
            trafficState: 'congestion',
          }),
          makeHotspot({
            intersectionId: 'INT-C',
            saturationForecast: 0.7,
            trafficState: 'pressure',
          }),
        ],
      }),
    });

    const decision = await agent.run(context);

    expect(decision?.kind).toBe('dispatch_global');
    expect(decision?.severity).toBe('critical');
    expect(decision?.payload?.['congestionCount']).toBe(2);
  });

  it('orders top hotspots by descending saturationForecast and caps at 5', async () => {
    const hotspots = Array.from({ length: 7 }, (_, idx) =>
      makeHotspot({
        intersectionId: `INT-${idx}`,
        label: `INT-${idx}`,
        // 7 hotspots with sat 0.86..0.92, all above 0.85 threshold.
        saturationForecast: (86 + idx) / 100,
        trafficState: 'pressure',
      }),
    );
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        congestionLevel: 'pressure',
        averageSaturation: 0.6,
        aggregatedMetrics: makeAggregated({ averageSaturation: 0.6 }),
        hotspots,
      }),
    });

    const decision = await agent.run(context);

    const top = decision?.payload?.['topHotspots'] as Array<{
      intersectionId: string;
      saturationForecast: number;
    }>;
    expect(top).toHaveLength(5);
    expect(top[0].intersectionId).toBe('INT-6');
    expect(top.map((h) => h.saturationForecast)).toEqual([
      0.92, 0.91, 0.9, 0.89, 0.88,
    ]);
  });

  it('returns non-empty enriched topHotspots for city scope when snapshot hotspots exist above threshold', async () => {
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-eljadida',
      scopeSnapshot: makeScopeSnapshot({
        scopeType: 'city',
        scopeRef: 'city-eljadida',
        congestionLevel: 'congestion',
        averageSaturation: 1.16,
        aggregatedMetrics: makeAggregated({ averageSaturation: 1.16 }),
        hotspots: [
          makeHotspot({
            intersectionId: 'CAR-0100',
            label: 'Av. Al Alaouiyine * Rte de Oualidia',
            district: 'El Jadida',
            trafficState: 'congestion',
            equipmentStatus: 'Équipé hors service',
            saturationForecast: 1.467,
            queueLengthForecast: 215,
            delaySecondsForecast: 93,
            metrics: makeMetrics({ saturation: 0.55, delaySeconds: 22 }),
          }),
        ],
      }),
    });

    const decision = await agent.run(context);
    const topHotspots = decision?.payload?.['topHotspots'] as Array<{
      intersectionId: string;
      label: string;
      district: string;
      trafficState: string;
      equipmentStatus: string;
      saturationForecast: number;
      queueLengthForecast: number;
      delaySecondsForecast: number;
      rankingFactors: string[];
      reasons: string[];
      recommendedAction: string;
    }>;

    expect(topHotspots).toHaveLength(1);
    expect(topHotspots[0]).toMatchObject({
      intersectionId: 'CAR-0100',
      label: 'Av. Al Alaouiyine * Rte de Oualidia',
      district: 'El Jadida',
      trafficState: 'congestion',
      equipmentStatus: 'Équipé hors service',
      saturationForecast: 1.467,
      queueLengthForecast: 215,
      delaySecondsForecast: 93,
      recommendedAction: 'inspect_controller',
    });
    expect(topHotspots[0].rankingFactors).toContain('forecast congestion state');
    expect(topHotspots[0].rankingFactors).toContain(
      'equipment status: Équipé hors service',
    );
    expect(topHotspots[0].reasons.length).toBeGreaterThan(0);
  });

  it('returns non-empty enriched topHotspots for zone scope when snapshot hotspots exist above threshold', async () => {
    const context = makeContext({
      scope: 'zone',
      scopeRef: 'dist-cas-sidi-belyout',
      scopeSnapshot: makeScopeSnapshot({
        scopeType: 'zone',
        scopeRef: 'dist-cas-sidi-belyout',
        label: 'Sidi Belyout',
        congestionLevel: 'congestion',
        averageSaturation: 1.5,
        aggregatedMetrics: makeAggregated({ averageSaturation: 1.5 }),
        hotspots: [
          makeHotspot({
            intersectionId: 'INT-CAS-003',
            label: 'Hassan II / Resistance',
            district: 'Sidi Belyout',
            trafficState: 'congestion',
            equipmentStatus: 'Équipé hors service',
            saturationForecast: 1.5,
            queueLengthForecast: 255,
            delaySecondsForecast: 189,
            metrics: makeMetrics({ saturation: 0.55, delaySeconds: 18 }),
          }),
        ],
      }),
    });

    const decision = await agent.run(context);
    const topHotspots = decision?.payload?.['topHotspots'] as Array<{
      intersectionId: string;
      saturationForecast: number;
      queueLengthForecast: number;
      delaySecondsForecast: number;
      equipmentStatus: string;
      recommendedAction: string;
    }>;

    expect(topHotspots).toHaveLength(1);
    expect(topHotspots[0]).toMatchObject({
      intersectionId: 'INT-CAS-003',
      saturationForecast: 1.5,
      queueLengthForecast: 255,
      delaySecondsForecast: 189,
      equipmentStatus: 'Équipé hors service',
      recommendedAction: 'inspect_controller',
    });
  });
});
