import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import appConfig from '../config/app.config';
import type {
  AiRecommendation,
  AiRecommendationAction,
  AiRiskLevel,
  IntersectionIntelligenceContext,
} from './traffic-intelligence.types';

interface GeminiTextResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

/**
 * The prompt that turns Gemini into a strict JSON oracle. Kept
 * deliberately small so it fits in the context window even when the
 * runtime config is chunky. Anything the model produces outside this
 * JSON shape is discarded — we always fall back to rule-based if we
 * can't parse.
 */
const SYSTEM_INSTRUCTION = `You are a traffic-signal engineering assistant.
You MUST respond with a single JSON object and nothing else.
You advise — you do not command. Never propose anything unsafe.
Required fields: action, targetPhaseId, durationSeconds, reason,
confidence (0..1), riskLevel ("low" | "medium" | "high"),
requiresHumanApproval (boolean).
action must be one of: "no_action" | "force_phase" |
"extend_phase" | "reduce_phase" | "release".
Use "no_action" when the intersection is healthy, the operator has
manual override active, or you lack sufficient data.
Never propose a phase that would make conflicting signal groups green
at the same time. Prefer smaller, reversible extensions over forcing
a new phase. When in doubt, requiresHumanApproval must be true.`;

const GEMINI_MODEL = 'gemini-1.5-flash-latest';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Produces a raw (pre-validator) recommendation either from Gemini
 * when the API key is configured, or from a deterministic heuristic
 * when it isn't. Returning instead of throwing when Gemini is
 * unavailable is part of the contract — the operator must always get
 * an answer.
 */
@Injectable()
export class AiRecommendationService {
  private readonly logger = new Logger(AiRecommendationService.name);

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async recommend(
    context: IntersectionIntelligenceContext,
    operatorHint?: string,
  ): Promise<Partial<AiRecommendation>> {
    if (this.config.aiControlMode === 'disabled') {
      return this.disabledStub(context);
    }
    if (!this.config.geminiApiKey) {
      return this.ruleBased(context, operatorHint, 'rule-based');
    }

    try {
      const geminiAnswer = await this.callGemini(context, operatorHint);
      if (geminiAnswer) {
        return { ...geminiAnswer, source: 'gemini' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Gemini call failed: ${message}`);
    }
    // Network/parse error → fall back rather than crash. Callers
    // always get a useable recommendation; the validator will mark
    // it requiresHumanApproval anyway.
    return this.ruleBased(context, operatorHint, 'fallback');
  }

  private disabledStub(
    context: IntersectionIntelligenceContext,
  ): Partial<AiRecommendation> {
    return {
      intersectionId: context.intersectionId,
      action: 'no_action',
      targetPhaseId: null,
      durationSeconds: null,
      reason:
        'AI_CONTROL_MODE is disabled on this server — returning empty recommendation.',
      confidence: 0,
      riskLevel: 'low',
      requiresHumanApproval: true,
      source: 'fallback',
    };
  }

  // ------------------------------------------------------------------
  // Rule-based fallback.
  //
  // Ported from the intuitive heuristics engineers use in the field:
  //   - If everything is smooth, do nothing.
  //   - If one approach is heavily congested and the currently active
  //     phase already serves it, propose a small extension.
  //   - If the congested approach is NOT currently active, propose
  //     forcing the phase that serves it, with a modest duration.
  //   - If an operator override is active, explicitly do nothing.
  // ------------------------------------------------------------------
  private ruleBased(
    context: IntersectionIntelligenceContext,
    operatorHint: string | undefined,
    source: 'rule-based' | 'fallback',
  ): Partial<AiRecommendation> {
    const intersection = context.intersection;
    const runtime = context.runtimeState;
    const cfg = context.runtimeConfig;
    const operator = context.operator;

    if (operator.manualOverride || operator.modeOverride) {
      return {
        intersectionId: context.intersectionId,
        action: 'no_action',
        targetPhaseId: null,
        durationSeconds: null,
        reason: 'Operator override active — leaving intersection to the human.',
        confidence: 0.9,
        riskLevel: 'low',
        requiresHumanApproval: true,
        source,
      };
    }

    // Find the worst congested bearing from Google traffic.
    const worst = [...context.googleTraffic.corridors].sort(
      (a, b) => b.delayFactor - a.delayFactor,
    )[0];
    const congestionHigh =
      (worst?.congestionLevel === 'heavy' ||
        worst?.congestionLevel === 'severe') ??
      false;
    const status = intersection?.status ?? 'healthy';

    if (status === 'healthy' && !congestionHigh) {
      return {
        intersectionId: context.intersectionId,
        action: 'no_action',
        targetPhaseId: null,
        durationSeconds: null,
        reason:
          operatorHint ??
          'All approaches flowing freely; no adjustment needed.',
        confidence: 0.75,
        riskLevel: 'low',
        requiresHumanApproval: true,
        source,
      };
    }

    // Try to match the worst bearing to a phase that gives green to
    // the signal group on that bearing.
    if (cfg && worst) {
      const sgOnBearing = cfg.signalGroups.find(
        (sg) => sg.approachBearing === worst.label,
      );
      if (sgOnBearing) {
        const phase = cfg.phases.find((p) =>
          p.greenSignalGroupIds.includes(sgOnBearing.id),
        );
        if (phase) {
          const activePhaseId = runtime?.activePhaseId ?? null;
          const isAlreadyActive = activePhaseId === phase.id;
          const action: AiRecommendationAction = isAlreadyActive
            ? 'extend_phase'
            : 'force_phase';
          const duration = isAlreadyActive
            ? Math.min(20, phase.minGreenSeconds + 10)
            : Math.max(phase.minGreenSeconds, 12);
          return {
            intersectionId: context.intersectionId,
            action,
            targetPhaseId: phase.id,
            durationSeconds: duration,
            reason: operatorHint
              ? `${operatorHint} · ${worst.label} approach heavy traffic (delay ${worst.delayFactor.toFixed(2)}× nominal).`
              : `${worst.label} approach heavy traffic (delay ${worst.delayFactor.toFixed(2)}× nominal).`,
            confidence: 0.6,
            riskLevel: congestionHigh ? 'medium' : 'low',
            requiresHumanApproval: true,
            source,
          };
        }
      }
    }

    return {
      intersectionId: context.intersectionId,
      action: 'no_action',
      targetPhaseId: null,
      durationSeconds: null,
      reason:
        operatorHint ??
        'Not enough context to recommend a safe action — defer to operator.',
      confidence: 0.4,
      riskLevel: 'medium',
      requiresHumanApproval: true,
      source,
    };
  }

  // ------------------------------------------------------------------
  // Gemini path.
  // ------------------------------------------------------------------
  private async callGemini(
    context: IntersectionIntelligenceContext,
    operatorHint: string | undefined,
  ): Promise<Partial<AiRecommendation> | null> {
    const apiKey = this.config.geminiApiKey;
    if (!apiKey) return null;

    const compactContext = this.summariseContext(context, operatorHint);
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Context:\n${JSON.stringify(compactContext)}\n\nReturn JSON only.`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Gemini HTTP ${response.status}${text ? ` · ${text.slice(0, 200)}` : ''}`,
      );
    }
    const payload = (await response.json()) as GeminiTextResponse;
    if (payload.promptFeedback?.blockReason) {
      this.logger.warn(
        `Gemini blocked prompt: ${payload.promptFeedback.blockReason}`,
      );
      return null;
    }
    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!rawText.trim()) return null;
    try {
      const parsed = JSON.parse(rawText) as Partial<AiRecommendation>;
      return { ...parsed, intersectionId: context.intersectionId };
    } catch (error) {
      this.logger.warn(
        `Gemini returned non-JSON payload: ${error instanceof Error ? error.message : 'parse error'}`,
      );
      return null;
    }
  }

  private summariseContext(
    context: IntersectionIntelligenceContext,
    operatorHint?: string,
  ) {
    const intersection = context.intersection;
    const runtime = context.runtimeState;
    const cfg = context.runtimeConfig;
    return {
      intersectionId: context.intersectionId,
      operatorHint: operatorHint ?? null,
      aiControlMode: context.aiControlMode,
      intersection: intersection
        ? {
            name: intersection.name,
            status: intersection.status,
            mode: intersection.mode,
            systemMode: intersection.systemMode,
            queueLength: intersection.queueLength,
            averageDelaySeconds: intersection.averageDelaySeconds,
            incidents: intersection.incidents,
          }
        : null,
      operator: context.operator,
      runtime: runtime
        ? {
            activePhaseId: runtime.activePhaseId,
            activePhaseLabel: runtime.activePhaseLabel,
            phaseState: runtime.phaseState,
            secondsRemaining: runtime.secondsRemainingInPhaseState,
            cycleSecond: runtime.cycleSecond,
            cycleSeconds: runtime.cycleSeconds,
            forcedPhaseId: runtime.commands.forcedPhaseId,
          }
        : null,
      phases:
        cfg?.phases.map((p) => ({
          id: p.id,
          label: p.label,
          greens: p.greenSignalGroupIds,
          minGreen: p.minGreenSeconds,
          yellow: p.yellowSeconds,
          redClearance: p.redClearanceSeconds,
        })) ?? [],
      conflicts: cfg?.conflicts ?? [],
      googleTraffic: {
        source: context.googleTraffic.source,
        corridors: context.googleTraffic.corridors,
      },
    };
  }
}

// re-exported so consumers can narrow on the discrete action set.
export type { AiRiskLevel };
