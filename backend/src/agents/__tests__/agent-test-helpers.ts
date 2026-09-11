import type {
  AggregatedTrafficMetrics,
  IntersectionTrafficMetrics,
  PredictionMetricsService,
} from '../../prediction/prediction-metrics.service';
import type { PredictionHorizon } from '../../prediction/prediction.dto';
import type {
  IntersectionPredictionSnapshotView,
  PredictionSnapshotsService,
  ScopePredictionHotspot,
  ScopePredictionSnapshotView,
} from '../../prediction-snapshots/prediction-snapshots.service';
import type {
  IntersectionPredictionAnalysis,
  TrafficPredictionAgentService,
} from '../../traffic-intelligence/traffic-prediction-agent.service';
import {
  AgentExecutionContext,
  type AgentRuntimeServices,
} from '../agent-execution.context';
import type {
  AgentDecision,
  AgentEvent,
  AgentOutput,
  AgentScope,
} from '../agent.types';

export const DEFAULT_CARREFOUR = 'carrefour-001';
export const DEFAULT_INTERSECTION = 'INT-CAS-001';

export function makeMetrics(
  overrides: Partial<IntersectionTrafficMetrics> = {},
): IntersectionTrafficMetrics {
  return {
    carrefourId: DEFAULT_CARREFOUR,
    intersectionCode: DEFAULT_INTERSECTION,
    flowVehiclesPerHour: 600,
    densityVehiclesPerKm: 30,
    averageSpeedKph: 35,
    queueLengthMetres: 20,
    queueLengthVehicles: 4,
    delaySeconds: 18,
    saturation: 0.5,
    capacityVehiclesPerHour: 1800,
    confidence: 0.8,
    observationCount: 25,
    ...overrides,
  };
}

export function makeAggregated(
  overrides: Partial<AggregatedTrafficMetrics> = {},
): AggregatedTrafficMetrics {
  return {
    averageFlowVehiclesPerHour: 600,
    averageDensityVehiclesPerKm: 30,
    averageSpeedKph: 35,
    totalQueueLengthMetres: 200,
    totalQueueLengthVehicles: 40,
    averageDelaySeconds: 22,
    averageSaturation: 0.55,
    averageConfidence: 0.8,
    totalCapacityVehiclesPerHour: 18000,
    sampleCount: 10,
    ...overrides,
  };
}

export function makeAnalysis(
  overrides: Partial<IntersectionPredictionAnalysis> = {},
): IntersectionPredictionAnalysis {
  return {
    intersectionId: DEFAULT_INTERSECTION,
    carrefourId: DEFAULT_CARREFOUR,
    predictedCongestionLevel: 'smooth',
    predictedTrend: 'stable',
    riskScore: 10,
    recommendedAction: 'maintain',
    rationale: ['Smooth flow.'],
    confidence: 0.8,
    generatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

export function makeIntersectionSnapshot(
  overrides: Partial<IntersectionPredictionSnapshotView> = {},
): IntersectionPredictionSnapshotView {
  const metrics = overrides.metrics ?? makeMetrics();
  return {
    scopeType: 'intersection',
    intersectionId: DEFAULT_INTERSECTION,
    carrefourId: DEFAULT_CARREFOUR,
    label: 'Test intersection',
    district: 'Centre',
    equipmentStatus: 'OK',
    horizon: 'H+15',
    generatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    trafficState: 'smooth',
    saturationForecast: metrics.saturation ?? 0.5,
    queueLengthForecast: metrics.queueLengthMetres ?? 0,
    delaySecondsForecast: metrics.delaySeconds ?? 0,
    confidence: metrics.confidence,
    metrics,
    ...overrides,
  };
}

export function makeHotspot(
  overrides: Partial<ScopePredictionHotspot> = {},
): ScopePredictionHotspot {
  const saturationForecast = overrides.saturationForecast ?? 0.5;
  // Default metrics.saturation to match saturationForecast so the
  // city-manager hotspot filter (which prefers metrics.saturation)
  // sees the value the test asked for. Callers can still override
  // by passing an explicit metrics object.
  const metrics =
    overrides.metrics ?? makeMetrics({ saturation: saturationForecast });
  return {
    intersectionId: 'INT-CAS-002',
    label: 'Hotspot intersection',
    district: 'Centre',
    equipmentStatus: 'OK',
    trafficState: 'smooth',
    horizon: 'H+15',
    queueLengthForecast: 30,
    delaySecondsForecast: 20,
    confidence: 0.8,
    ...overrides,
    saturationForecast,
    metrics,
  };
}

export function makeScopeSnapshot(
  overrides: Partial<ScopePredictionSnapshotView> = {},
): ScopePredictionSnapshotView {
  return {
    id: 'snap-1',
    scopeType: 'city',
    scopeRef: 'city-001',
    label: 'Casablanca',
    horizon: 'H+15',
    generatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    nodeCount: 5,
    averageSaturation: 0.55,
    totalQueueMetres: 200,
    averageDelaySeconds: 22,
    averageConfidence: 0.8,
    congestionLevel: 'smooth',
    aggregatedMetrics: makeAggregated(),
    hotspots: [],
    ...overrides,
  };
}

export interface StubServicesOptions {
  intersectionSnapshot?: IntersectionPredictionSnapshotView;
  scopeSnapshot?: ScopePredictionSnapshotView;
  analysis?: IntersectionPredictionAnalysis;
  /**
   * If provided, called for each (code, horizon) request — overrides
   * the static `intersectionSnapshot`. Useful when an agent reads
   * multiple intersections.
   */
  intersectionSnapshotFor?: (
    code: string,
    horizon: PredictionHorizon,
  ) =>
    | IntersectionPredictionSnapshotView
    | Promise<IntersectionPredictionSnapshotView>;
  /**
   * If provided, called for each metrics request. Allows controlling
   * `analyzeIntersection` results indirectly by feeding it different
   * metrics per intersection.
   */
  analyzeFor?: (
    metrics: IntersectionTrafficMetrics,
  ) => IntersectionPredictionAnalysis;
}

export function buildStubServices(
  options: StubServicesOptions = {},
): AgentRuntimeServices {
  const intersectionSnapshot =
    options.intersectionSnapshot ?? makeIntersectionSnapshot();
  const scopeSnapshot = options.scopeSnapshot ?? makeScopeSnapshot();
  const analysis = options.analysis ?? makeAnalysis();

  const snapshotsService = {
    getIntersectionSnapshot: jest.fn(
      async (code: string, horizon: PredictionHorizon) =>
        options.intersectionSnapshotFor
          ? options.intersectionSnapshotFor(code, horizon)
          : intersectionSnapshot,
    ),
    getCitySnapshot: jest.fn(() => Promise.resolve(scopeSnapshot)),
    getZoneSnapshot: jest.fn(() => Promise.resolve(scopeSnapshot)),
  } as unknown as PredictionSnapshotsService;

  const predictionAgent = {
    analyzeIntersection: jest.fn((metrics: IntersectionTrafficMetrics) =>
      options.analyzeFor ? options.analyzeFor(metrics) : analysis,
    ),
  } as unknown as TrafficPredictionAgentService;

  const metricsService = {} as PredictionMetricsService;

  return { metricsService, snapshotsService, predictionAgent };
}

export interface MakeContextOptions extends StubServicesOptions {
  scope?: AgentScope;
  scopeRef?: string;
  horizon?: PredictionHorizon;
  events?: AgentEvent[];
  services?: AgentRuntimeServices;
}

export function makeContext(
  options: MakeContextOptions = {},
): AgentExecutionContext {
  return new AgentExecutionContext(
    options.scope ?? 'intersection',
    options.scopeRef ?? DEFAULT_INTERSECTION,
    options.horizon ?? 'H+15',
    options.events ?? [],
    options.services ?? buildStubServices(options),
  );
}

/** Seed a prior decision into the context so the next agent can read it. */
export function seedDecision(
  context: AgentExecutionContext,
  decision: AgentDecision,
  agentId = 'seed-agent',
): void {
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const output: AgentOutput = {
    agentId,
    agentType: 'seed',
    scope: context.scope,
    scopeRef: context.scopeRef,
    status: 'success',
    decision,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
  };
  context.outputs.push(output);
}
