import type { Repository } from 'typeorm';

import type { CitiesService, CityView } from '../cities/cities.service';
import type { TopologyReferenceService } from '../cities/topology-reference.service';
import type {
  CarrefourEntity,
  PredictionSnapshotEntity,
} from '../database/entities';
import type {
  IntersectionsService,
  IntersectionView,
} from '../intersections/intersections.service';
import type { IntersectionRuntimeService } from '../intersection-runtime/intersection-runtime.service';
import { makeMetrics } from './__tests__/agent-test-helpers';
import type { PredictionMetricsService } from '../prediction/prediction-metrics.service';
import type { PredictionService } from '../prediction/prediction.service';
import { PredictionSnapshotsService } from '../prediction-snapshots/prediction-snapshots.service';
import type { ZoneView, ZonesService } from '../zones/zones.service';

type MetricsFixture = ReturnType<typeof makeMetrics>;
type PredictionFixture = Awaited<ReturnType<PredictionService['run']>>;

const HOT_INTERSECTION: IntersectionView = {
  id: 'int-hot',
  code: 'INT-HOT',
  name: 'Critical Junction',
  regionId: 'reg-cas-settat',
  cityId: 'city-eljadida',
  zoneId: 'dist-cas-sidi-belyout',
  district: 'Sidi Belyout',
  address: '1 Main Street',
  latitude: 33.59,
  longitude: -7.62,
  status: 'critical',
  controlMode: 'manual',
  queueLength: 26,
  incidents: 3,
  averageDelaySeconds: 132,
  controllerId: 'CTL-001',
  controllerType: 'ATC',
  controllerConnectionState: 'degraded',
  systemMode: 'field',
  lastHeartbeat: new Date('2026-05-07T10:00:00.000Z').toISOString(),
};

const CALM_INTERSECTION: IntersectionView = {
  ...HOT_INTERSECTION,
  id: 'int-calm',
  code: 'INT-CALM',
  name: 'Calm Junction',
  district: 'El Jadida Centre',
  status: 'healthy',
  controlMode: 'adaptive',
  queueLength: 3,
  incidents: 0,
  averageDelaySeconds: 18,
  controllerId: 'CTL-002',
  controllerConnectionState: 'online',
};

function buildHarness() {
  const snapshotRepository = {
    create: jest.fn((entity: Partial<PredictionSnapshotEntity>) => entity),
    save: jest.fn((entity: Partial<PredictionSnapshotEntity>) =>
      Promise.resolve({
        id: 'snap-001',
        createdAt: new Date('2026-05-07T10:00:00.000Z'),
        updatedAt: new Date('2026-05-07T10:00:00.000Z'),
        generatedAt: new Date('2026-05-07T10:00:00.000Z'),
        ...entity,
      }),
    ),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<PredictionSnapshotEntity>;

  const carrefourRepository = {
    find: jest.fn(() =>
      Promise.resolve([
        {
          id: 'carrefour-hot',
          engineeringIntersection: { code: HOT_INTERSECTION.code },
        },
        {
          id: 'carrefour-calm',
          engineeringIntersection: { code: CALM_INTERSECTION.code },
        },
      ] satisfies Array<Partial<CarrefourEntity>>),
    ),
  } as unknown as Repository<CarrefourEntity>;

  const intersectionsService = {
    list: jest.fn(() => Promise.resolve([HOT_INTERSECTION, CALM_INTERSECTION])),
  } as unknown as IntersectionsService;

  const predictionService = {
    run: jest.fn((carrefourId: string) =>
      Promise.resolve({
        carrefourId,
        generatedAt: new Date('2026-05-07T10:00:00.000Z').toISOString(),
        baseline: {
          saturation: 0.55,
          queueMetres: 72,
          capacityVph: 14400,
          criticality: 0.6,
          criticalityLevel: 'moderate',
        },
        forecasts: [
          {
            horizon: 'H+15' as const,
            saturationForecast: 0.55,
            queueLengthForecast: 72,
            delaySecondsForecast: 29,
            confidence: 0.75,
            notes: [],
          },
        ],
        agentSlots: [],
      } satisfies PredictionFixture),
    ),
  } as unknown as PredictionService;

  const metricsService = {
    computeForCarrefour: jest.fn(
      (carrefourId: string, intersectionCode: string) =>
        Promise.resolve(
          makeMetrics({
            carrefourId,
            intersectionCode,
            saturation: 0.55,
            queueLengthMetres:
              intersectionCode === HOT_INTERSECTION.code ? 60 : 12,
            queueLengthVehicles:
              intersectionCode === HOT_INTERSECTION.code ? 9 : 2,
            delaySeconds: intersectionCode === HOT_INTERSECTION.code ? 48 : 18,
            observationCount: 18,
          }),
        ),
    ),
    aggregate: jest.fn((metrics: MetricsFixture[]) =>
      aggregateMetrics(metrics),
    ),
  } as unknown as PredictionMetricsService;

  const citiesService = {
    list: jest.fn(() =>
      Promise.resolve([
        {
          id: 'city-eljadida',
          regionId: 'reg-cas-settat',
          name: 'El Jadida',
          nameAr: 'الجديدة',
          center: { lat: 33.23, lng: -8.5 },
          defaultZoom: 11,
          intersectionCount: 2,
          controllerCount: 2,
          incidentCount: 8,
          averageDelaySeconds: 78,
          tone: 'critical',
        },
      ] satisfies CityView[]),
    ),
  } as unknown as CitiesService;

  const zonesService = {
    list: jest.fn(() =>
      Promise.resolve([
        {
          id: 'dist-cas-sidi-belyout',
          cityId: 'city-eljadida',
          regionId: 'reg-cas-settat',
          name: 'Sidi Belyout',
          nameAr: 'سيدي بليوط',
          center: { lat: 33.59, lng: -7.62 },
          intersectionCount: 2,
          incidentCount: 3,
          averageDelaySeconds: 132,
          tone: 'critical',
        },
      ] satisfies ZoneView[]),
    ),
  } as unknown as ZonesService;

  const intersectionRuntime = {
    getState: jest.fn((intersectionCode: string) => ({
      commands:
        intersectionCode === HOT_INTERSECTION.code
          ? {
              modeOverride: 'fail-safe',
              manualOverride: true,
              forcedPhaseId: 'ph-1',
            }
          : {
              modeOverride: 'normal',
              manualOverride: false,
              forcedPhaseId: null,
            },
    })),
  } as unknown as IntersectionRuntimeService;

  const topology = {
    findCity: jest.fn((id: string) =>
      id === 'city-eljadida' ? { id, name: 'El Jadida' } : null,
    ),
    findZone: jest.fn((id: string) =>
      id === 'dist-cas-sidi-belyout' ? { id, name: 'Sidi Belyout' } : null,
    ),
  } as unknown as TopologyReferenceService;

  return new PredictionSnapshotsService(
    snapshotRepository,
    carrefourRepository,
    intersectionsService,
    predictionService,
    metricsService,
    citiesService,
    zonesService,
    intersectionRuntime,
    topology,
  );
}

function aggregateMetrics(metrics: MetricsFixture[]) {
  const count = Math.max(metrics.length, 1);
  return {
    averageFlowVehiclesPerHour:
      sumMetrics(metrics, (entry) => entry.flowVehiclesPerHour) / count || null,
    averageDensityVehiclesPerKm: 28,
    averageSpeedKph: 31,
    totalQueueLengthMetres: sumMetrics(
      metrics,
      (entry) => entry.queueLengthMetres,
    ),
    totalQueueLengthVehicles: sumMetrics(
      metrics,
      (entry) => entry.queueLengthVehicles,
    ),
    averageDelaySeconds:
      sumMetrics(metrics, (entry) => entry.delaySeconds) / count || null,
    averageSaturation:
      sumMetrics(metrics, (entry) => entry.saturation) / count || null,
    averageConfidence:
      metrics.reduce((sum, entry) => sum + entry.confidence, 0) / count || null,
    totalCapacityVehiclesPerHour: sumMetrics(
      metrics,
      (entry) => entry.capacityVehiclesPerHour,
    ),
    sampleCount: metrics.length,
  };
}

function sumMetrics(
  metrics: MetricsFixture[],
  pick: (entry: MetricsFixture) => number | null,
) {
  return metrics.reduce((sum, entry) => sum + (pick(entry) ?? 0), 0);
}

describe('PredictionSnapshotsService — scope quality enrichment', () => {
  it('amplifies city snapshots with real incident and delay signals', async () => {
    const service = buildHarness();

    const snapshot = await service.getCitySnapshot('city-eljadida');

    expect(snapshot.scopeType).toBe('city');
    expect(snapshot.hotspots[0]?.intersectionId).toBe(HOT_INTERSECTION.code);
    expect(snapshot.hotspots[0]?.saturationForecast).toBeGreaterThan(0.85);
    expect(snapshot.averageDelaySeconds).toBeGreaterThanOrEqual(78);
    expect(snapshot.congestionLevel).not.toBe('smooth');
  });

  it('turns a critical zone into a congestion hotspot instead of flat 0.55', async () => {
    const service = buildHarness();

    const snapshot = await service.getZoneSnapshot('dist-cas-sidi-belyout');

    expect(snapshot.scopeType).toBe('zone');
    expect(snapshot.congestionLevel).toBe('congestion');
    expect(snapshot.averageSaturation).toBeGreaterThan(0.85);
    expect(snapshot.hotspots[0]?.intersectionId).toBe(HOT_INTERSECTION.code);
    expect(snapshot.hotspots[0]?.delaySecondsForecast).toBeGreaterThan(120);
  });

  it('accepts live-style city horizon strings with spaces and still returns hotspots', async () => {
    const service = buildHarness();

    const snapshot = await service.getCitySnapshot(
      'city-eljadida',
      'H 15' as never,
    );

    expect(snapshot.horizon).toBe('H+15');
    expect(snapshot.hotspots.length).toBeGreaterThan(0);
    expect(snapshot.hotspots[0]?.saturationForecast).toBeGreaterThan(0.85);
  });

  it('accepts live-style zone horizon strings with spaces and still returns hotspots', async () => {
    const service = buildHarness();

    const snapshot = await service.getZoneSnapshot(
      'dist-cas-sidi-belyout',
      'H 15' as never,
    );

    expect(snapshot.horizon).toBe('H+15');
    expect(snapshot.hotspots.length).toBeGreaterThan(0);
    expect(snapshot.hotspots[0]?.delaySecondsForecast).toBeGreaterThan(120);
  });
});
