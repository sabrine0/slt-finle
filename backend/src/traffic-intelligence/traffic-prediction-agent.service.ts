import { Injectable } from '@nestjs/common';

import type {
  AggregatedTrafficMetrics,
  IntersectionTrafficMetrics,
} from '../prediction/prediction-metrics.service';

export type PredictedCongestionLevel = 'smooth' | 'pressure' | 'congestion';
export type PredictedTrend = 'improving' | 'stable' | 'worsening';

/**
 * Operator-facing recommendation. Codes are stable for the UI to map
 * to localised labels and icons.
 */
export type RecommendedAction =
  | 'maintain'
  | 'monitor'
  | 'increase_green'
  | 'extend_cycle'
  | 'police_action'
  | 'no_data';

export interface IntersectionPredictionAnalysis {
  intersectionId: string | null;
  carrefourId: string;
  predictedCongestionLevel: PredictedCongestionLevel;
  predictedTrend: PredictedTrend;
  /** 0..100 — 0 = no risk, 100 = saturated + critical queue + critical delay. */
  riskScore: number;
  recommendedAction: RecommendedAction;
  /** Plain-language reasons, one bullet per rule that fired. */
  rationale: string[];
  /** Mirrors the upstream metrics confidence so the UI can dim cold cells. */
  confidence: number;
  generatedAt: string;
}

export interface AgentScopeContext {
  /** Optional zone- or city-level aggregated metrics for context. */
  aggregatedScope?: AggregatedTrafficMetrics | null;
}

// ────── thresholds (HCM 2010 inspired, tuned for urban Moroccan signals) ──────
const SATURATION_PRESSURE = 0.7;
const SATURATION_CONGESTION = 0.9;
const QUEUE_HIGH_METRES = 80;
const QUEUE_CRITICAL_METRES = 150;
const DELAY_HIGH_SECONDS = 45;
const DELAY_CRITICAL_SECONDS = 90;

@Injectable()
export class TrafficPredictionAgentService {
  /**
   * Pure rule-based decision layer. No model state, no I/O. Given the
   * latest engineering metrics, classify the intersection and pick a
   * recommended action for the operator.
   */
  analyzeIntersection(
    metrics: IntersectionTrafficMetrics,
    context: AgentScopeContext = {},
  ): IntersectionPredictionAnalysis {
    const generatedAt = new Date().toISOString();
    const rationale: string[] = [];

    // ── No-data fallback ──
    if (
      metrics.observationCount === 0 &&
      metrics.saturation == null &&
      metrics.queueLengthMetres == null &&
      metrics.delaySeconds == null
    ) {
      return {
        intersectionId: metrics.intersectionCode,
        carrefourId: metrics.carrefourId,
        predictedCongestionLevel: 'smooth',
        predictedTrend: 'stable',
        riskScore: 0,
        recommendedAction: 'no_data',
        rationale: [
          'No engineering observations available — keep fixed-time control until detectors report.',
        ],
        confidence: metrics.confidence,
        generatedAt,
      };
    }

    // ── Step 1: congestion level from saturation ──
    const saturation = metrics.saturation ?? 0;
    let level: PredictedCongestionLevel;
    if (saturation > SATURATION_CONGESTION) {
      level = 'congestion';
      rationale.push(
        `Saturation X=${saturation.toFixed(2)} above ${SATURATION_CONGESTION} → congestion.`,
      );
    } else if (saturation >= SATURATION_PRESSURE) {
      level = 'pressure';
      rationale.push(
        `Saturation X=${saturation.toFixed(2)} in [${SATURATION_PRESSURE}, ${SATURATION_CONGESTION}] → pressure.`,
      );
    } else {
      level = 'smooth';
      rationale.push(
        `Saturation X=${saturation.toFixed(2)} below ${SATURATION_PRESSURE} → smooth.`,
      );
    }

    // ── Step 2: trend signals from queue + delay (+ scope context) ──
    let worseningSignals = 0;
    let improvingSignals = 0;

    const queue = metrics.queueLengthMetres ?? 0;
    if (queue >= QUEUE_CRITICAL_METRES) {
      worseningSignals += 2;
      rationale.push(
        `Queue ${Math.round(queue)} m exceeds critical threshold (${QUEUE_CRITICAL_METRES} m).`,
      );
    } else if (queue >= QUEUE_HIGH_METRES) {
      worseningSignals += 1;
      rationale.push(
        `Queue ${Math.round(queue)} m above high threshold (${QUEUE_HIGH_METRES} m).`,
      );
    } else if (queue > 0 && queue < QUEUE_HIGH_METRES * 0.4) {
      improvingSignals += 1;
    }

    const delay = metrics.delaySeconds ?? 0;
    if (delay >= DELAY_CRITICAL_SECONDS) {
      worseningSignals += 2;
      rationale.push(
        `Delay ${Math.round(delay)} s exceeds critical threshold (${DELAY_CRITICAL_SECONDS} s).`,
      );
    } else if (delay >= DELAY_HIGH_SECONDS) {
      worseningSignals += 1;
      rationale.push(
        `Delay ${Math.round(delay)} s above high threshold (${DELAY_HIGH_SECONDS} s).`,
      );
    } else if (delay > 0 && delay < DELAY_HIGH_SECONDS * 0.4) {
      improvingSignals += 1;
    }

    if (level === 'congestion') worseningSignals += 1;
    if (
      level === 'smooth' &&
      queue < QUEUE_HIGH_METRES * 0.4 &&
      delay < DELAY_HIGH_SECONDS * 0.4
    ) {
      improvingSignals += 1;
    }

    // Bias by surrounding scope: if the city/zone is already worse on
    // average than this intersection, the local trend is "improving"
    // (relatively); if it's better, this one is "worsening" (a hot
    // pocket). Only acts as a tie-breaker.
    const scope = context.aggregatedScope;
    if (
      scope &&
      scope.averageSaturation != null &&
      metrics.saturation != null
    ) {
      if (metrics.saturation > scope.averageSaturation + 0.1) {
        worseningSignals += 1;
        rationale.push(
          `Local saturation outpaces zone average by ${(metrics.saturation - scope.averageSaturation).toFixed(2)}.`,
        );
      } else if (metrics.saturation < scope.averageSaturation - 0.1) {
        improvingSignals += 1;
      }
    }

    let trend: PredictedTrend;
    if (worseningSignals >= 2 && worseningSignals > improvingSignals) {
      trend = 'worsening';
    } else if (improvingSignals > worseningSignals) {
      trend = 'improving';
    } else {
      trend = 'stable';
    }

    // ── Step 3: risk score 0..100 (saturation 50, queue 25, delay 25) ──
    const saturationComponent = Math.min(saturation / 1.2, 1) * 50;
    const queueComponent = Math.min(queue / QUEUE_CRITICAL_METRES, 1) * 25;
    const delayComponent = Math.min(delay / DELAY_CRITICAL_SECONDS, 1) * 25;
    const riskScore = Math.round(
      saturationComponent + queueComponent + delayComponent,
    );

    // ── Step 4: recommended action ──
    let recommendedAction: RecommendedAction;
    if (
      riskScore >= 85 ||
      (level === 'congestion' &&
        trend === 'worsening' &&
        queue >= QUEUE_CRITICAL_METRES)
    ) {
      recommendedAction = 'police_action';
      rationale.push(
        'Risk ≥ 85 or critical queue with worsening congestion → dispatch traffic police on site.',
      );
    } else if (level === 'congestion') {
      recommendedAction = 'extend_cycle';
      rationale.push(
        'Sustained congestion → extend cycle length and re-balance phase splits.',
      );
    } else if (level === 'pressure' && trend === 'worsening') {
      recommendedAction = 'increase_green';
      rationale.push(
        'Pressure with worsening trend → increase green time on dominant approach.',
      );
    } else if (level === 'pressure') {
      recommendedAction = 'monitor';
      rationale.push(
        'Steady pressure → monitor evolution before adjusting plan.',
      );
    } else {
      recommendedAction = 'maintain';
      rationale.push('Smooth flow → keep current timing plan.');
    }

    return {
      intersectionId: metrics.intersectionCode,
      carrefourId: metrics.carrefourId,
      predictedCongestionLevel: level,
      predictedTrend: trend,
      riskScore,
      recommendedAction,
      rationale,
      confidence: metrics.confidence,
      generatedAt,
    };
  }
}
