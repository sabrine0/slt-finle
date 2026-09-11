import type { AiControlMode } from '../config/app.config';
import type {
  IntersectionConfigResponse,
  IntersectionRuntimeState,
} from '../intersection-runtime/intersection-runtime.types';
import type {
  IntersectionSnapshot,
  OperatorDirection,
  IntersectionMode,
} from '../traffic/traffic.types';

/**
 * The discrete set of actions the AI is allowed to propose.
 *
 * `no_action` is a first-class option so the assistant can explicitly
 * say "do nothing". Any direct hardware-affecting action
 * (`force_phase`, `extend_phase`, `reduce_phase`) must go through the
 * existing operator-command path — this module never applies commands
 * on its own.
 */
export type AiRecommendationAction =
  | 'no_action'
  | 'force_phase'
  | 'extend_phase'
  | 'reduce_phase'
  | 'release';

export type AiRiskLevel = 'low' | 'medium' | 'high';

/**
 * The strict JSON shape the AI (or rule-based fallback) must produce,
 * extended with safety metadata computed by the validator. Anything
 * that leaves this module on the wire conforms to this contract.
 */
export interface AiRecommendation {
  intersectionId: string;
  action: AiRecommendationAction;
  targetPhaseId: string | null;
  durationSeconds: number | null;
  reason: string;
  confidence: number;
  riskLevel: AiRiskLevel;
  requiresHumanApproval: boolean;
  safetyWarnings: string[];
  source: 'gemini' | 'rule-based' | 'fallback';
  generatedAt: string;
}

export interface GoogleTrafficCorridor {
  label: string;
  durationSeconds: number;
  durationInTrafficSeconds: number;
  delayFactor: number;
  congestionLevel: 'free' | 'light' | 'moderate' | 'heavy' | 'severe';
}

export interface GoogleTrafficSnapshot {
  intersectionId: string;
  capturedAt: string;
  source: 'google' | 'fallback' | 'disabled';
  corridors: GoogleTrafficCorridor[];
  note?: string;
}

/**
 * The fused context the AI (and the API consumer) sees. Combines
 * internal signals (runtime state + config) with the external traffic
 * picture from Google, so a single snapshot is enough to reason about
 * the intersection's current pressure.
 */
export interface IntersectionIntelligenceContext {
  intersectionId: string;
  capturedAt: string;
  aiControlMode: AiControlMode;
  aiAutoApplyReal: boolean;
  intersection: IntersectionSnapshot | null;
  runtimeState: IntersectionRuntimeState | null;
  runtimeConfig: IntersectionConfigResponse | null;
  operator: {
    manualOverride: boolean;
    forcedDirection: OperatorDirection | null;
    modeOverride: IntersectionMode | null;
  };
  googleTraffic: GoogleTrafficSnapshot;
}
