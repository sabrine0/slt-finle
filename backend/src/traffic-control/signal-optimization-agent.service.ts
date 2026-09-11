import { Injectable } from '@nestjs/common';

import type { BranchDirection } from '../database/entities';
import type { IntersectionTrafficMetrics } from '../prediction/prediction-metrics.service';
import type { IntersectionPredictionAnalysis } from '../traffic-intelligence/traffic-prediction-agent.service';

export interface BranchSaturationView {
  branchId: string;
  direction: BranchDirection;
  saturation: number;
  inflowVph: number;
  capacityVph: number;
  label?: string | null;
}

export interface SignalOptimizationInput {
  metrics: IntersectionTrafficMetrics;
  prediction: IntersectionPredictionAnalysis;
  branchSaturations: BranchSaturationView[];
  /** Cycle length on the active timing plan, when known. */
  currentCycleSeconds?: number | null;
}

export interface PhaseRecommendation {
  phaseId: string;
  direction: BranchDirection;
  label: string | null;
  saturation: number;
  inflowVph: number;
  capacityVph: number;
  currentGreenSeconds: number;
  recommendedGreenSeconds: number;
  greenAdjustmentSeconds: number;
  priorityRank: number;
  reason: string;
}

export interface SignalOptimizationPlan {
  carrefourId: string;
  intersectionCode: string | null;
  predictedCongestionLevel: IntersectionPredictionAnalysis['predictedCongestionLevel'];
  recommendedAction: IntersectionPredictionAnalysis['recommendedAction'];
  currentCycleSeconds: number;
  recommendedCycleSeconds: number;
  cycleAdjustmentSeconds: number;
  phasePriority: BranchDirection[];
  phases: PhaseRecommendation[];
  rationale: string[];
  confidence: number;
  generatedAt: string;
  /**
   * If true, the operator must engage manual override before the
   * runtime applies anything. Triggered for police_action and when
   * geometry/data is too thin for a safe automatic plan.
   */
  requiresOperatorReview: boolean;
}

// ── Engineering constants (urban arterial defaults, HCM-aligned) ──
const DEFAULT_CYCLE_SECONDS = 90;
const MIN_CYCLE_SECONDS = 60;
const MAX_CYCLE_SECONDS = 150;
const CYCLE_EXTENSION_FOR_CONGESTION = 20;

/** Yellow + all-red clearance per phase. */
const LOST_TIME_PER_PHASE_SECONDS = 4;
const MIN_GREEN_PER_PHASE_SECONDS = 10;
const MAX_GREEN_PER_PHASE_SECONDS = 60;

/** Congestion saturation threshold above which we extend the cycle. */
const SATURATION_CONGESTION = 0.9;
const SATURATION_PRESSURE = 0.7;

@Injectable()
export class SignalOptimizationAgentService {
  /**
   * Pure rule-based signal-timing planner.
   * Produces a recommended cycle length, per-phase green splits
   * weighted by saturation, and a priority order.
   * Performs no I/O and no learning — every output is auditable.
   */
  optimize(input: SignalOptimizationInput): SignalOptimizationPlan {
    const {
      metrics,
      prediction,
      branchSaturations,
      currentCycleSeconds: providedCycle,
    } = input;

    const generatedAt = new Date().toISOString();
    const rationale: string[] = [];

    const currentCycleSeconds =
      providedCycle && providedCycle > 0
        ? providedCycle
        : DEFAULT_CYCLE_SECONDS;

    // ── 0. Sanity / no-data fallbacks ──
    if (branchSaturations.length === 0) {
      rationale.push(
        'No branch geometry available — keep current cycle, flag for operator review.',
      );
      return {
        carrefourId: metrics.carrefourId,
        intersectionCode: metrics.intersectionCode,
        predictedCongestionLevel: prediction.predictedCongestionLevel,
        recommendedAction: prediction.recommendedAction,
        currentCycleSeconds,
        recommendedCycleSeconds: currentCycleSeconds,
        cycleAdjustmentSeconds: 0,
        phasePriority: [],
        phases: [],
        rationale,
        confidence: prediction.confidence,
        generatedAt,
        requiresOperatorReview: true,
      };
    }

    // ── 1. Cycle length adjustment ──
    let recommendedCycleSeconds = currentCycleSeconds;
    if (prediction.predictedCongestionLevel === 'congestion') {
      recommendedCycleSeconds = clamp(
        currentCycleSeconds + CYCLE_EXTENSION_FOR_CONGESTION,
        MIN_CYCLE_SECONDS,
        MAX_CYCLE_SECONDS,
      );
      rationale.push(
        `Congestion detected → extend cycle from ${currentCycleSeconds}s to ${recommendedCycleSeconds}s.`,
      );
    } else if (prediction.predictedCongestionLevel === 'pressure') {
      rationale.push(
        `Pressure but not yet saturated → keep cycle at ${currentCycleSeconds}s, redistribute splits.`,
      );
    } else {
      rationale.push(
        `Smooth flow → keep cycle at ${currentCycleSeconds}s with even splits.`,
      );
    }

    // Hard cap if upstream agent says hand control over to police
    const requiresOperatorReview =
      prediction.recommendedAction === 'police_action' ||
      prediction.recommendedAction === 'no_data';
    if (prediction.recommendedAction === 'police_action') {
      rationale.push(
        'Recommended action is police_action — recommendation is advisory only, runtime must wait for operator manual override.',
      );
    }

    // ── 2. Per-phase green time split ──
    const phaseCount = branchSaturations.length;
    const lostTime = LOST_TIME_PER_PHASE_SECONDS * phaseCount;
    const effectiveGreen = Math.max(
      MIN_GREEN_PER_PHASE_SECONDS * phaseCount,
      recommendedCycleSeconds - lostTime,
    );

    const baselineEqualGreen = Math.max(
      MIN_GREEN_PER_PHASE_SECONDS,
      Math.floor(
        (currentCycleSeconds - LOST_TIME_PER_PHASE_SECONDS * phaseCount) /
          phaseCount,
      ),
    );

    const totalSaturation = branchSaturations.reduce(
      (sum, branch) => sum + Math.max(branch.saturation, 0.01),
      0,
    );

    const sorted = [...branchSaturations].sort(
      (left, right) => right.saturation - left.saturation,
    );
    const dominantBranch = sorted[0];

    if (
      prediction.predictedCongestionLevel !== 'smooth' &&
      dominantBranch.saturation >= SATURATION_PRESSURE
    ) {
      rationale.push(
        `Dominant flow on ${dominantBranch.direction} (X=${dominantBranch.saturation.toFixed(2)}) → bias green toward this approach.`,
      );
    }

    // Bias factor: pressure/congestion shifts green to the high-X
    // branch; smooth keeps even splits.
    const biasStrength =
      prediction.predictedCongestionLevel === 'congestion'
        ? 0.65
        : prediction.predictedCongestionLevel === 'pressure'
          ? 0.4
          : 0;

    const directionPriority = sorted.map((branch) => branch.direction);

    const phases: PhaseRecommendation[] = sorted.map((branch, index) => {
      const evenShare = effectiveGreen / phaseCount;
      const weightedShare =
        effectiveGreen * (Math.max(branch.saturation, 0.01) / totalSaturation);
      const blendedShare =
        evenShare * (1 - biasStrength) + weightedShare * biasStrength;

      // Extra +6s on the worst branch when its queue is critical.
      let recommendedGreen = blendedShare;
      if (
        index === 0 &&
        metrics.queueLengthMetres != null &&
        metrics.queueLengthMetres >= 150
      ) {
        recommendedGreen += 6;
        rationale.push(
          `Critical queue ${Math.round(metrics.queueLengthMetres)} m → +6 s green on ${branch.direction}.`,
        );
      }

      recommendedGreen = clamp(
        Math.round(recommendedGreen),
        MIN_GREEN_PER_PHASE_SECONDS,
        MAX_GREEN_PER_PHASE_SECONDS,
      );

      const reason =
        prediction.predictedCongestionLevel === 'smooth'
          ? 'Even split — flow is smooth.'
          : index === 0
            ? `Highest saturation (X=${branch.saturation.toFixed(2)}) → priority green.`
            : `Saturation X=${branch.saturation.toFixed(2)}, rank ${index + 1}.`;

      return {
        phaseId: branch.branchId,
        direction: branch.direction,
        label: branch.label ?? null,
        saturation: Number(branch.saturation.toFixed(3)),
        inflowVph: branch.inflowVph,
        capacityVph: branch.capacityVph,
        currentGreenSeconds: baselineEqualGreen,
        recommendedGreenSeconds: recommendedGreen,
        greenAdjustmentSeconds: recommendedGreen - baselineEqualGreen,
        priorityRank: index + 1,
        reason,
      };
    });

    // Renormalise rounded greens so they fit inside the cycle exactly.
    const greenSum = phases.reduce(
      (sum, phase) => sum + phase.recommendedGreenSeconds,
      0,
    );
    const drift = effectiveGreen - greenSum;
    if (drift !== 0 && phases.length > 0) {
      phases[0].recommendedGreenSeconds = clamp(
        phases[0].recommendedGreenSeconds + drift,
        MIN_GREEN_PER_PHASE_SECONDS,
        MAX_GREEN_PER_PHASE_SECONDS,
      );
      phases[0].greenAdjustmentSeconds =
        phases[0].recommendedGreenSeconds - phases[0].currentGreenSeconds;
    }

    return {
      carrefourId: metrics.carrefourId,
      intersectionCode: metrics.intersectionCode,
      predictedCongestionLevel: prediction.predictedCongestionLevel,
      recommendedAction: prediction.recommendedAction,
      currentCycleSeconds,
      recommendedCycleSeconds,
      cycleAdjustmentSeconds: recommendedCycleSeconds - currentCycleSeconds,
      phasePriority: directionPriority,
      phases,
      rationale,
      confidence: prediction.confidence,
      generatedAt,
      requiresOperatorReview,
    };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
