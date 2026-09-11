import { AiSafetyValidatorService } from './ai-safety-validator.service';
import type {
  AiRecommendation,
  IntersectionIntelligenceContext,
} from './traffic-intelligence.types';

interface ContextOverrides {
  aiControlMode?: 'advisory' | 'supervised' | 'disabled';
  aiAutoApplyReal?: boolean;
  systemMode?: 'real' | 'simulation';
  manualOverride?: boolean;
  modeOverride?: 'emergency' | 'manual' | 'flash' | 'fail-safe' | null;
  withRuntimeConfig?: boolean;
}

function buildContext(
  overrides: ContextOverrides = {},
): IntersectionIntelligenceContext {
  const withCfg = overrides.withRuntimeConfig ?? true;
  return {
    intersectionId: 'int-001',
    capturedAt: new Date().toISOString(),
    aiControlMode: overrides.aiControlMode ?? 'advisory',
    aiAutoApplyReal: overrides.aiAutoApplyReal ?? false,
    intersection: {
      id: 'int-001',
      name: 'Test Intersection',
      district: 'Test',
      address: 'Test',
      location: { lat: 0, lng: 0 },
      mode: 'adaptive',
      status: 'healthy',
      queueLength: 0,
      incidents: 0,
      averageDelaySeconds: 0,
      controllerId: 'ctrl-001',
      controllerConnectionState: 'online',
      systemMode: overrides.systemMode ?? 'simulation',
      lastHeartbeat: new Date().toISOString(),
    },
    runtimeState: null,
    runtimeConfig: withCfg
      ? {
          intersectionId: 'int-001',
          isDefault: true,
          signalGroups: [
            { id: 'sg-n', approachBearing: 'N' },
            { id: 'sg-e', approachBearing: 'E' },
            { id: 'sg-s', approachBearing: 'S' },
            { id: 'sg-w', approachBearing: 'W' },
          ],
          detectors: [],
          phases: [
            {
              id: 'ph-1',
              label: 'N/S green',
              greenSignalGroupIds: ['sg-n', 'sg-s'],
              minGreenSeconds: 12,
              yellowSeconds: 3,
              redClearanceSeconds: 2,
            },
            {
              id: 'ph-2',
              label: 'E/W green',
              greenSignalGroupIds: ['sg-e', 'sg-w'],
              minGreenSeconds: 12,
              yellowSeconds: 3,
              redClearanceSeconds: 2,
            },
          ],
          stages: [
            { id: 'st-1', phaseId: 'ph-1', order: 1 },
            { id: 'st-2', phaseId: 'ph-2', order: 2 },
          ],
          conflicts: [
            { a: 'sg-n', b: 'sg-e' },
            { a: 'sg-n', b: 'sg-w' },
            { a: 'sg-s', b: 'sg-e' },
            { a: 'sg-s', b: 'sg-w' },
          ],
          cycleSeconds: 34,
        }
      : null,
    operator: {
      manualOverride: overrides.manualOverride ?? false,
      forcedDirection: null,
      modeOverride: overrides.modeOverride ?? null,
    },
    googleTraffic: {
      intersectionId: 'int-001',
      capturedAt: new Date().toISOString(),
      source: 'disabled',
      corridors: [],
    },
  };
}

function makeValidator(
  aiControlMode: 'advisory' | 'supervised' | 'disabled' = 'advisory',
  aiAutoApplyReal = false,
): AiSafetyValidatorService {
  return new AiSafetyValidatorService({
    aiControlMode,
    aiAutoApplyReal,
  } as any);
}

describe('AiSafetyValidatorService', () => {
  it('marks every recommendation requiresHumanApproval in advisory mode', () => {
    const validator = makeValidator('advisory');
    const raw: Partial<AiRecommendation> = {
      action: 'force_phase',
      targetPhaseId: 'ph-1',
      durationSeconds: 15,
      reason: 'test',
      confidence: 0.9,
      riskLevel: 'low',
      requiresHumanApproval: false,
      source: 'gemini',
    };
    const result = validator.validate(raw, buildContext());
    expect(result.requiresHumanApproval).toBe(true);
  });

  it('suppresses AI action when an operator override is active', () => {
    const validator = makeValidator('supervised');
    const raw: Partial<AiRecommendation> = {
      action: 'force_phase',
      targetPhaseId: 'ph-1',
      durationSeconds: 15,
      reason: 'test',
      confidence: 0.9,
      riskLevel: 'low',
      source: 'gemini',
    };
    const result = validator.validate(
      raw,
      buildContext({ manualOverride: true }),
    );
    expect(result.action).toBe('no_action');
    expect(result.targetPhaseId).toBeNull();
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.safetyWarnings.some((w) => /override/i.test(w))).toBe(true);
  });

  it('suppresses AI action for emergency mode override', () => {
    const validator = makeValidator('supervised');
    const result = validator.validate(
      {
        action: 'extend_phase',
        targetPhaseId: 'ph-1',
        durationSeconds: 10,
        reason: 'unused',
        confidence: 0.8,
        riskLevel: 'low',
        source: 'gemini',
      },
      buildContext({ modeOverride: 'emergency' }),
    );
    expect(result.action).toBe('no_action');
    expect(result.requiresHumanApproval).toBe(true);
  });

  it('forces human approval and adds a warning for real-mode intersections', () => {
    const validator = makeValidator('supervised');
    const result = validator.validate(
      {
        action: 'force_phase',
        targetPhaseId: 'ph-1',
        durationSeconds: 15,
        reason: 'test',
        confidence: 0.9,
        riskLevel: 'low',
        source: 'gemini',
      },
      buildContext({ systemMode: 'real' }),
    );
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.safetyWarnings.some((w) => /REAL mode/.test(w))).toBe(true);
  });

  it('rejects unknown targetPhaseId and downgrades to no_action', () => {
    const validator = makeValidator('supervised');
    const result = validator.validate(
      {
        action: 'force_phase',
        targetPhaseId: 'ph-nope',
        durationSeconds: 15,
        reason: 'test',
        confidence: 0.9,
        riskLevel: 'low',
        source: 'gemini',
      },
      buildContext(),
    );
    expect(result.action).toBe('no_action');
    expect(result.targetPhaseId).toBeNull();
    expect(result.requiresHumanApproval).toBe(true);
  });

  it('clamps durationSeconds below minGreen up to the phase minimum', () => {
    const validator = makeValidator('supervised');
    const result = validator.validate(
      {
        action: 'extend_phase',
        targetPhaseId: 'ph-1',
        durationSeconds: 2,
        reason: 'test',
        confidence: 0.8,
        riskLevel: 'low',
        source: 'gemini',
      },
      buildContext(),
    );
    // Phase 1 minGreen is 12s — should clamp up.
    expect(result.durationSeconds).toBe(12);
    expect(result.safetyWarnings.some((w) => /Duration clamped/.test(w))).toBe(
      true,
    );
  });

  it('clamps durationSeconds above the global max down to 60s', () => {
    const validator = makeValidator('supervised');
    const result = validator.validate(
      {
        action: 'force_phase',
        targetPhaseId: 'ph-1',
        durationSeconds: 300,
        reason: 'test',
        confidence: 0.9,
        riskLevel: 'low',
        source: 'gemini',
      },
      buildContext(),
    );
    expect(result.durationSeconds).toBeLessThanOrEqual(60);
    expect(result.safetyWarnings.some((w) => /Duration clamped/.test(w))).toBe(
      true,
    );
  });

  it('degrades to no_action when runtime config is missing', () => {
    const validator = makeValidator('supervised');
    const result = validator.validate(
      {
        action: 'force_phase',
        targetPhaseId: 'ph-1',
        durationSeconds: 15,
        reason: 'test',
        confidence: 0.9,
        riskLevel: 'low',
        source: 'gemini',
      },
      buildContext({ withRuntimeConfig: false }),
    );
    expect(result.action).toBe('no_action');
    expect(result.requiresHumanApproval).toBe(true);
  });

  it('passes a valid safe force_phase through in supervised mode', () => {
    const validator = makeValidator('supervised');
    const result = validator.validate(
      {
        action: 'force_phase',
        targetPhaseId: 'ph-1',
        durationSeconds: 15,
        reason: 'Test ok',
        confidence: 0.8,
        riskLevel: 'low',
        requiresHumanApproval: false,
        source: 'gemini',
      },
      buildContext({ aiControlMode: 'supervised' }),
    );
    expect(result.action).toBe('force_phase');
    expect(result.targetPhaseId).toBe('ph-1');
    expect(result.requiresHumanApproval).toBe(false);
  });
});
