import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import appConfig from '../config/app.config';
import { IntersectionRuntimeService } from '../intersection-runtime/intersection-runtime.service';
import { PredictionSnapshotsService } from '../prediction-snapshots/prediction-snapshots.service';
import type { PredictionHorizon } from '../prediction/prediction.dto';
import { TrafficService } from '../traffic/traffic.service';
import type { AnalyzeTrafficDto } from './dto/analyze-traffic.dto';
import { AiRecommendationService } from './ai-recommendation.service';
import { AiSafetyValidatorService } from './ai-safety-validator.service';
import { GoogleTrafficService } from './google-traffic.service';
import type {
  AiRecommendation,
  IntersectionIntelligenceContext,
} from './traffic-intelligence.types';
import {
  TrafficPredictionAgentService,
  type IntersectionPredictionAnalysis,
} from './traffic-prediction-agent.service';

export interface StoredRecommendation extends AiRecommendation {
  recordedAt: string;
  operatorHint?: string;
  allowAutoApplyRequested: boolean;
}

const HISTORY_PER_INTERSECTION = 25;

/**
 * Orchestrates the AI Assist pipeline:
 *
 *  fetchContext → AiRecommendationService → AiSafetyValidatorService
 *                                            ↓
 *                                  in-memory history ring
 *
 * Does NOT issue any runtime commands on its own. The decision to
 * apply always comes from the operator via the existing runtime
 * endpoints; we just produce auditable advice.
 */
@Injectable()
export class TrafficIntelligenceService {
  private readonly logger = new Logger(TrafficIntelligenceService.name);
  private readonly history = new Map<string, StoredRecommendation[]>();

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly trafficService: TrafficService,
    private readonly runtimeService: IntersectionRuntimeService,
    private readonly googleTraffic: GoogleTrafficService,
    private readonly aiRecommendation: AiRecommendationService,
    private readonly aiSafety: AiSafetyValidatorService,
    private readonly predictionSnapshots: PredictionSnapshotsService,
    private readonly predictionAgent: TrafficPredictionAgentService,
  ) {}

  /**
   * Decision-support output for an intersection: pulls the latest
   * engineering snapshot, then runs the rule-based prediction agent.
   */
  async getIntersectionPrediction(
    intersectionId: string,
    horizon: PredictionHorizon = 'H+15',
  ): Promise<IntersectionPredictionAnalysis> {
    const snapshot = await this.predictionSnapshots.getIntersectionSnapshot(
      intersectionId,
      horizon,
    );
    return this.predictionAgent.analyzeIntersection(snapshot.metrics);
  }

  async getContext(
    intersectionId: string,
  ): Promise<IntersectionIntelligenceContext> {
    const snapshot = await this.trafficService.getSnapshot().catch(() => null);
    // Intersection IDs in the traffic snapshot can be upper or mixed
    // case (e.g. "INT-001") while the runtime / override audit uses
    // the operator-entered case (often lowercase). Match case-
    // insensitively so the AI context survives either form.
    const needle = intersectionId.toLowerCase();
    const intersection =
      snapshot?.intersections.find((i) => i.id.toLowerCase() === needle) ??
      null;

    if (!intersection && !this.runtimeKnowsAbout(intersectionId)) {
      // If the intersection is not in the snapshot AND the runtime
      // has never heard of it either, surface a clear 404 instead of
      // returning an empty analysis silently.
      throw new NotFoundException(
        `Intersection "${intersectionId}" is not known to the runtime or command platform.`,
      );
    }

    const runtimeState = this.safeGetState(intersectionId);
    const runtimeConfig = this.safeGetConfig(intersectionId);
    const operator =
      this.trafficService.readOperatorCommandState(intersectionId);
    const googleTraffic = await this.googleTraffic.snapshotForIntersection(
      intersection,
      intersectionId,
    );

    return {
      intersectionId,
      capturedAt: new Date().toISOString(),
      aiControlMode: this.config.aiControlMode,
      aiAutoApplyReal: this.config.aiAutoApplyReal,
      intersection,
      runtimeState,
      runtimeConfig,
      operator,
      googleTraffic,
    };
  }

  async analyze(
    intersectionId: string,
    dto: AnalyzeTrafficDto,
  ): Promise<AiRecommendation> {
    const context = await this.getContext(intersectionId);
    const hint = dto.operatorGoal
      ? `${dto.operatorGoal}${dto.reasonHint ? ' · ' + dto.reasonHint : ''}`
      : dto.reasonHint;

    const raw = await this.aiRecommendation.recommend(context, hint);
    const validated = this.aiSafety.validate(raw, context);

    this.record(intersectionId, {
      ...validated,
      recordedAt: validated.generatedAt,
      operatorHint: hint,
      allowAutoApplyRequested: Boolean(dto.allowAutoApply),
    });

    if (dto.allowAutoApply && !validated.requiresHumanApproval) {
      // Even when the operator asks for auto-apply, we never issue
      // the command from here — we log a warning so the audit trail
      // makes the attempt visible but leave the decision to the
      // existing runtime/override endpoints.
      this.logger.warn(
        `allowAutoApply=true ignored for ${intersectionId}; AI Assist never issues runtime commands directly (mode=${this.config.aiControlMode}).`,
      );
    }

    return validated;
  }

  getRecommendations(intersectionId: string): StoredRecommendation[] {
    const entries = this.history.get(intersectionId);
    if (!entries) return [];
    // Latest first.
    return [...entries].sort((a, b) =>
      a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : 0,
    );
  }

  private record(intersectionId: string, entry: StoredRecommendation) {
    const bucket = this.history.get(intersectionId) ?? [];
    bucket.push(entry);
    // Ring buffer keeps memory bounded in a long-running dev process.
    while (bucket.length > HISTORY_PER_INTERSECTION) {
      bucket.shift();
    }
    this.history.set(intersectionId, bucket);
  }

  private runtimeKnowsAbout(intersectionId: string): boolean {
    try {
      const ids = this.runtimeService.listKnownIds();
      return ids.includes(intersectionId);
    } catch {
      return false;
    }
  }

  private safeGetState(intersectionId: string) {
    try {
      return this.runtimeService.getState(intersectionId);
    } catch (error) {
      this.logger.debug(
        `Runtime state unavailable for ${intersectionId}: ${error instanceof Error ? error.message : 'error'}`,
      );
      return null;
    }
  }

  private safeGetConfig(intersectionId: string) {
    try {
      return this.runtimeService.getConfig(intersectionId);
    } catch (error) {
      this.logger.debug(
        `Runtime config unavailable for ${intersectionId}: ${error instanceof Error ? error.message : 'error'}`,
      );
      return null;
    }
  }
}
