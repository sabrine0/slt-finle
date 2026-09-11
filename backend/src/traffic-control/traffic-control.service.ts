import { Injectable } from '@nestjs/common';

import type { BranchDirection } from '../database/entities';
import { IntersectionsService } from '../intersections/intersections.service';
import { PredictionSnapshotsService } from '../prediction-snapshots/prediction-snapshots.service';
import type { PredictionHorizon } from '../prediction/prediction.dto';
import { SignalPlansService } from '../signal-plans/signal-plans.service';
import { SaturationEstimatorService } from '../traffic-analysis/saturation-estimator.service';
import { TrafficPredictionAgentService } from '../traffic-intelligence/traffic-prediction-agent.service';
import {
  SignalOptimizationAgentService,
  type BranchSaturationView,
  type SignalOptimizationPlan,
} from './signal-optimization-agent.service';

/**
 * Orchestrator for the active-control surface. Pulls fresh
 * engineering metrics, runs the prediction agent, fetches per-branch
 * saturation and the active cycle length, then asks the optimization
 * agent for a recommended timing plan.
 */
@Injectable()
export class TrafficControlService {
  constructor(
    private readonly predictionSnapshots: PredictionSnapshotsService,
    private readonly predictionAgent: TrafficPredictionAgentService,
    private readonly saturationService: SaturationEstimatorService,
    private readonly intersectionsService: IntersectionsService,
    private readonly signalPlansService: SignalPlansService,
    private readonly optimizationAgent: SignalOptimizationAgentService,
  ) {}

  async optimizeIntersection(
    intersectionId: string,
    horizon: PredictionHorizon = 'H+15',
  ): Promise<SignalOptimizationPlan> {
    const snapshot = await this.predictionSnapshots.getIntersectionSnapshot(
      intersectionId,
      horizon,
    );
    const prediction = this.predictionAgent.analyzeIntersection(
      snapshot.metrics,
    );

    const [branchSaturations, currentCycleSeconds] = await Promise.all([
      this.collectBranchSaturations(snapshot.metrics.carrefourId),
      this.findActiveCycleLength(snapshot.intersectionId),
    ]);

    return this.optimizationAgent.optimize({
      metrics: snapshot.metrics,
      prediction,
      branchSaturations,
      currentCycleSeconds,
    });
  }

  private async collectBranchSaturations(
    carrefourId: string,
  ): Promise<BranchSaturationView[]> {
    const result =
      await this.saturationService.estimateForCarrefour(carrefourId);
    return result.perBranch.map((entry) => ({
      branchId: entry.branchId,
      direction: entry.direction as BranchDirection,
      saturation: entry.saturation,
      inflowVph: entry.inflowVph,
      capacityVph: entry.capacityVph,
    }));
  }

  private async findActiveCycleLength(
    intersectionCode: string,
  ): Promise<number | null> {
    const intersections = await this.intersectionsService.list();
    const match = intersections.find(
      (entry) =>
        entry.code === intersectionCode || entry.id === intersectionCode,
    );
    if (!match) return null;
    const plans = await this.signalPlansService.list({
      intersectionId: match.id,
    });
    if (plans.length === 0) return null;
    const active = plans.find((plan) => plan.status === 'active') ?? plans[0];
    return active.cycleLengthSeconds;
  }
}
