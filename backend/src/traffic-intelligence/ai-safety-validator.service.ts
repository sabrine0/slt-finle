import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import appConfig from '../config/app.config';
import type {
  AiRecommendation,
  AiRecommendationAction,
  AiRiskLevel,
  IntersectionIntelligenceContext,
} from './traffic-intelligence.types';

/**
 * Minimum green time we enforce for any AI-proposed phase, in case the
 * runtime config doesn't declare its own minimum. Keeps a drunk AI
 * response from asking for a 1-second green.
 */
const GLOBAL_MIN_GREEN_SECONDS = 5;

/**
 * Max extension the AI is ever allowed to propose in a single
 * recommendation. Real TOPS controllers cap at ~20–30s extension per
 * cycle; we mirror that conservatively.
 */
const GLOBAL_MAX_DURATION_SECONDS = 60;

const VALID_ACTIONS: AiRecommendationAction[] = [
  'no_action',
  'force_phase',
  'extend_phase',
  'reduce_phase',
  'release',
];

const VALID_RISK_LEVELS: AiRiskLevel[] = ['low', 'medium', 'high'];

/**
 * Normalises and safety-clamps whatever comes out of the AI (or the
 * rule-based fallback) before it ever leaves the backend. The output
 * of this service is what the API actually returns to the operator.
 *
 * Rules enforced here:
 *  - AI is advisory only. If AI_CONTROL_MODE !== 'supervised' the
 *    recommendation is marked requiresHumanApproval regardless.
 *  - Real-mode intersections NEVER get auto-apply, regardless of
 *    AI_AUTO_APPLY_REAL. (Belt-and-braces — the controller also refuses.)
 *  - A manual/police/emergency override is sacred — any proposed
 *    action becomes `no_action` until the human releases.
 *  - targetPhaseId must reference a phase declared in the runtime
 *    config; unknown phases are downgraded to `no_action`.
 *  - durationSeconds is clamped to [minGreen, maxExtension].
 *  - Phase greens that would violate the conflict matrix are rejected.
 */
@Injectable()
export class AiSafetyValidatorService {
  private readonly logger = new Logger(AiSafetyValidatorService.name);

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  validate(
    raw: Partial<AiRecommendation>,
    context: IntersectionIntelligenceContext,
  ): AiRecommendation {
    const warnings: string[] = [];

    // Start by normalising fields that are common to all shapes.
    let action: AiRecommendationAction = isValidAction(raw.action)
      ? raw.action
      : 'no_action';
    let targetPhaseId =
      typeof raw.targetPhaseId === 'string' ? raw.targetPhaseId : null;
    let durationSeconds =
      typeof raw.durationSeconds === 'number' &&
      Number.isFinite(raw.durationSeconds)
        ? raw.durationSeconds
        : null;
    let confidence =
      typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
        ? clamp(raw.confidence, 0, 1)
        : 0.5;
    let riskLevel: AiRiskLevel = isValidRisk(raw.riskLevel)
      ? raw.riskLevel
      : 'medium';
    const reason =
      typeof raw.reason === 'string' && raw.reason.trim().length > 0
        ? raw.reason.trim().slice(0, 500)
        : 'No reason provided';
    const source =
      raw.source === 'gemini' || raw.source === 'rule-based'
        ? raw.source
        : 'fallback';

    // Advisory mode (the default) always bolts on approval required.
    const mode = this.config.aiControlMode;
    let requiresHumanApproval = mode !== 'supervised';
    if (raw.requiresHumanApproval === true) {
      requiresHumanApproval = true;
    }

    // Real mode + non-simulation intersection → always human-approve.
    const operatingEnv = context.intersection?.systemMode;
    if (operatingEnv === 'real' && !this.config.aiAutoApplyReal) {
      requiresHumanApproval = true;
      warnings.push(
        'Intersection operates in REAL mode — AI may only advise, not apply.',
      );
    }
    if (operatingEnv === 'real' && this.config.aiAutoApplyReal) {
      // Even if the feature flag is on we keep human approval for
      // real intersections; auto-apply is a deliberate lab-only
      // setting that only relaxes simulation behaviour.
      requiresHumanApproval = true;
      warnings.push(
        'AI_AUTO_APPLY_REAL is enabled but real-mode auto-apply remains disabled at the safety layer.',
      );
    }

    // Police / manual / emergency / fail-safe override is untouchable.
    const operator = context.operator;
    const overrideMode = operator.modeOverride;
    const protectedOverride =
      operator.manualOverride ||
      overrideMode === 'emergency' ||
      overrideMode === 'fail-safe' ||
      overrideMode === 'flash' ||
      overrideMode === 'manual';
    if (protectedOverride) {
      action = 'no_action';
      targetPhaseId = null;
      durationSeconds = null;
      confidence = Math.min(confidence, 0.3);
      riskLevel = 'high';
      requiresHumanApproval = true;
      warnings.push(
        `Operator override active (${overrideMode ?? 'manual'}) — AI recommendation suppressed.`,
      );
    }

    // If the runtime config is missing we can't validate phase ids
    // or conflicts, so the safest posture is no_action.
    const runtimeConfig = context.runtimeConfig;
    if (!runtimeConfig) {
      if (action !== 'no_action' && action !== 'release') {
        warnings.push(
          'Runtime config unavailable — AI action cannot be validated against phase set.',
        );
        action = 'no_action';
        targetPhaseId = null;
        durationSeconds = null;
        riskLevel = 'high';
        requiresHumanApproval = true;
      }
    } else if (
      action === 'force_phase' ||
      action === 'extend_phase' ||
      action === 'reduce_phase'
    ) {
      const phase = runtimeConfig.phases.find((p) => p.id === targetPhaseId);
      if (!phase) {
        warnings.push(
          `targetPhaseId "${targetPhaseId ?? ''}" is not declared on this intersection.`,
        );
        action = 'no_action';
        targetPhaseId = null;
        durationSeconds = null;
        riskLevel = 'high';
        requiresHumanApproval = true;
      } else {
        // Clamp duration to min-green / max-extension.
        const minGreen = Math.max(
          GLOBAL_MIN_GREEN_SECONDS,
          phase.minGreenSeconds,
        );
        const requested = durationSeconds ?? minGreen;
        const clamped = clamp(
          Math.round(requested),
          minGreen,
          GLOBAL_MAX_DURATION_SECONDS,
        );
        if (clamped !== requested) {
          warnings.push(
            `Duration clamped to [${minGreen}, ${GLOBAL_MAX_DURATION_SECONDS}]s (was ${requested}s).`,
          );
        }
        durationSeconds = clamped;

        // Conflict matrix check — no two green signal groups may
        // conflict. The runtime service also enforces this but we
        // refuse early so we don't even propose a bad phase.
        const greens = new Set(phase.greenSignalGroupIds);
        for (const pair of runtimeConfig.conflicts) {
          if (greens.has(pair.a) && greens.has(pair.b)) {
            warnings.push(
              `Phase "${phase.id}" greens conflict (${pair.a} / ${pair.b}). Suppressed.`,
            );
            action = 'no_action';
            targetPhaseId = null;
            durationSeconds = null;
            riskLevel = 'high';
            requiresHumanApproval = true;
            break;
          }
        }
      }
    }

    // `release` never carries a target or duration.
    if (action === 'release' || action === 'no_action') {
      targetPhaseId = null;
      durationSeconds = null;
    }

    // Confidence floor on safety-suppressed actions.
    if (warnings.length > 0 && confidence > 0.5) {
      confidence = 0.5;
    }

    const result: AiRecommendation = {
      intersectionId: context.intersectionId,
      action,
      targetPhaseId,
      durationSeconds,
      reason,
      confidence,
      riskLevel,
      requiresHumanApproval,
      safetyWarnings: warnings,
      source,
      generatedAt: new Date().toISOString(),
    };
    if (warnings.length > 0) {
      this.logger.debug(
        `Validator adjusted recommendation for ${context.intersectionId}: ${warnings.join(' | ')}`,
      );
    }
    return result;
  }
}

function isValidAction(value: unknown): value is AiRecommendationAction {
  return (
    typeof value === 'string' &&
    VALID_ACTIONS.includes(value as AiRecommendationAction)
  );
}

function isValidRisk(value: unknown): value is AiRiskLevel {
  return (
    typeof value === 'string' &&
    VALID_RISK_LEVELS.includes(value as AiRiskLevel)
  );
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
