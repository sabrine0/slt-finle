import { NotFoundException } from '@nestjs/common';

import type {
  AggregatedTrafficMetrics,
  IntersectionTrafficMetrics,
  PredictionMetricsService,
} from '../prediction/prediction-metrics.service';
import type { PredictionHorizon } from '../prediction/prediction.dto';
import type {
  IntersectionPredictionSnapshotView,
  PredictionSnapshotsService,
  ScopePredictionSnapshotView,
} from '../prediction-snapshots/prediction-snapshots.service';
import type { TrafficPredictionAgentService } from '../traffic-intelligence/traffic-prediction-agent.service';
import type { IntersectionPredictionAnalysis } from '../traffic-intelligence/traffic-prediction-agent.service';
import type {
  AgentDecision,
  AgentEvent,
  AgentOutput,
  AgentScope,
} from './agent.types';

/**
 * Backend services the runtime hands off to the context. Kept as an
 * explicit interface so each agent can read what it needs without
 * pulling in DI plumbing.
 */
export interface AgentRuntimeServices {
  metricsService: PredictionMetricsService;
  snapshotsService: PredictionSnapshotsService;
  predictionAgent: TrafficPredictionAgentService;
}

/**
 * Per-invocation context. Created once by the runtime and passed to
 * each agent. Caches expensive data (snapshots, metrics) so multiple
 * agents in the same run don't refetch the same thing.
 *
 * Agents:
 *  - read inputs via the typed accessors below
 *  - read previous decisions via `decisions()` / `hasOverride()`
 *  - return their decision from `Agent.run` — the runtime appends to
 *    `outputs[]` so they are visible to downstream agents
 */
export class AgentExecutionContext {
  readonly outputs: AgentOutput[] = [];

  private intersectionSnapshotCache = new Map<
    string,
    IntersectionPredictionSnapshotView
  >();
  private predictionAnalysisCache = new Map<
    string,
    IntersectionPredictionAnalysis
  >();
  private intersectionMetricsCache = new Map<
    string,
    IntersectionTrafficMetrics
  >();
  private scopeSnapshotCache: ScopePredictionSnapshotView | null = null;

  constructor(
    readonly scope: AgentScope,
    readonly scopeRef: string,
    readonly horizon: PredictionHorizon,
    readonly events: AgentEvent[],
    private readonly services: AgentRuntimeServices,
  ) {}

  // ───────── data accessors ─────────

  /**
   * Per-intersection metrics. Pass an explicit code when running at
   * zone / city scope; defaults to `scopeRef` for intersection scope.
   */
  async getIntersectionMetrics(
    intersectionCode?: string,
  ): Promise<IntersectionTrafficMetrics> {
    const code = intersectionCode ?? this.scopeRef;
    const cached = this.intersectionMetricsCache.get(code);
    if (cached) return cached;

    const snapshot = await this.getIntersectionSnapshot(code);
    this.intersectionMetricsCache.set(code, snapshot.metrics);
    return snapshot.metrics;
  }

  /** Decision-support agent output for one intersection (cached). */
  async getPredictionAnalysis(
    intersectionCode?: string,
  ): Promise<IntersectionPredictionAnalysis> {
    const code = intersectionCode ?? this.scopeRef;
    const cached = this.predictionAnalysisCache.get(code);
    if (cached) return cached;

    const metrics = await this.getIntersectionMetrics(code);
    const analysis = this.services.predictionAgent.analyzeIntersection(metrics);
    this.predictionAnalysisCache.set(code, analysis);
    return analysis;
  }

  /** Full per-intersection snapshot (forecast + metrics + label). */
  async getIntersectionSnapshot(
    intersectionCode?: string,
  ): Promise<IntersectionPredictionSnapshotView> {
    const code = intersectionCode ?? this.scopeRef;
    const cached = this.intersectionSnapshotCache.get(code);
    if (cached) return cached;

    const snapshot =
      await this.services.snapshotsService.getIntersectionSnapshot(
        code,
        this.horizon,
      );
    this.intersectionSnapshotCache.set(code, snapshot);
    return snapshot;
  }

  /**
   * City- or zone-aggregated forecast snapshot (with metrics +
   * hotspots). Only valid when the run scope is city or zone.
   */
  async getScopeSnapshot(): Promise<ScopePredictionSnapshotView> {
    if (this.scope === 'intersection') {
      throw new NotFoundException(
        'Aggregated snapshot is only available for zone/city scope.',
      );
    }
    if (this.scopeSnapshotCache) return this.scopeSnapshotCache;

    const snapshot =
      this.scope === 'city'
        ? await this.services.snapshotsService.getCitySnapshot(
            this.scopeRef,
            this.horizon,
          )
        : await this.services.snapshotsService.getZoneSnapshot(
            this.scopeRef,
            this.horizon,
          );
    this.scopeSnapshotCache = snapshot;
    return snapshot;
  }

  /** Aggregated metrics for the current zone/city scope. */
  async getAggregatedMetrics(): Promise<AggregatedTrafficMetrics> {
    const snapshot = await this.getScopeSnapshot();
    return snapshot.aggregatedMetrics;
  }

  // ───────── event accessors ─────────

  hasEvent(type: AgentEvent['type']): boolean {
    return this.events.some((entry) => entry.type === type);
  }

  getEvents(type: AgentEvent['type']): AgentEvent[] {
    return this.events.filter((entry) => entry.type === type);
  }

  // ───────── output / decision accessors ─────────

  /** All decisions emitted so far in this run (in run order). */
  decisions(): AgentDecision[] {
    return this.outputs
      .map((output) => output.decision)
      .filter((decision): decision is AgentDecision => decision != null);
  }

  /** True if any prior decision flagged itself as an override. */
  hasOverride(): boolean {
    return this.decisions().some((decision) => decision.override === true);
  }

  /** True if a `manual_release` event is present in the input. */
  hasReleaseSignal(): boolean {
    return this.hasEvent('manual_release');
  }
}
