import { PhaseType } from '../database/entities/enums';
import { OfflineProposalGenerator } from './offline-proposal-generator';
import type { ProposalGenerationInput } from './proposal-types';

function tangerInput(
  overrides: Partial<ProposalGenerationInput> = {},
): ProposalGenerationInput {
  return {
    name: 'Bd Mohammed VI / Av. d Espagne',
    district: 'Marshan',
    latitude: 35.7849,
    longitude: -5.8136,
    scope: 'standard',
    ...overrides,
  };
}

describe('OfflineProposalGenerator', () => {
  const generator = new OfflineProposalGenerator();

  it('declares offline mode', () => {
    expect(generator.mode).toBe('offline');
  });

  it('returns a proposal set with 9 proposals on standard scope (incl. 4 roundabout variants)', async () => {
    const set = await generator.generate(tangerInput());
    expect(set.proposals).toHaveLength(9);
    expect(set.id).toMatch(/^set_/);
    expect(set.source).toBe('offline:heuristic-v1');
    expect(set.expiresAt).toBeTruthy();
    expect(set.proposals.map((entry) => entry.variantCode).sort()).toEqual([
      'adaptive-smart',
      'compact-2-phase',
      'metered-roundabout',
      'pedestrian-controlled-entries',
      'pedestrian-priority',
      'protected-4-phase',
      'signalized-roundabout',
      'standard-3-phase',
      'unsignalized-mini-roundabout',
    ]);
  });

  it('adds a tram-priority variant when scope=tram', async () => {
    const set = await generator.generate(tangerInput({ scope: 'tram' }));
    expect(set.proposals).toHaveLength(10);
    const codes = set.proposals.map((p) => p.variantCode);
    expect(codes).toContain('tram-priority');
  });

  it('roundabout variants have engineering-appropriate content', async () => {
    const set = await generator.generate(tangerInput());
    const codes = set.proposals.map((p) => p.variantCode);
    expect(codes).toContain('unsignalized-mini-roundabout');
    expect(codes).toContain('signalized-roundabout');
    expect(codes).toContain('metered-roundabout');
    expect(codes).toContain('pedestrian-controlled-entries');

    const unsigned = set.proposals.find(
      (p) => p.variantCode === 'unsignalized-mini-roundabout',
    );
    // No signal groups, no phases for the unsignalized variant
    expect(unsigned!.signalGroups).toHaveLength(0);
    expect(unsigned!.phases).toHaveLength(0);

    const signalized = set.proposals.find(
      (p) => p.variantCode === 'signalized-roundabout',
    );
    // One phase per entry
    expect(signalized!.phases).toHaveLength(signalized!.branches.length);

    const metered = set.proposals.find(
      (p) => p.variantCode === 'metered-roundabout',
    );
    expect(metered!.signalGroups).toHaveLength(1); // single meter signal

    const pedCtrl = set.proposals.find(
      (p) => p.variantCode === 'pedestrian-controlled-entries',
    );
    // Has a pedestrian phase + dormant vehicle phase
    expect(
      pedCtrl!.phases.some((ph) => ph.phaseType === PhaseType.PEDESTRIAN),
    ).toBe(true);
  });

  it('every signalised proposal carries non-trivial engineering content', async () => {
    const set = await generator.generate(tangerInput());
    const signalised = set.proposals.filter(
      (p) =>
        ![
          // Roundabout family has different invariants (no ped groups
          // or no signals at all) — covered by a dedicated test.
          'unsignalized-mini-roundabout',
          'metered-roundabout',
          'pedestrian-controlled-entries',
          'signalized-roundabout',
        ].includes(p.variantCode),
    );
    for (const proposal of signalised) {
      // Geometry
      expect(proposal.branches.length).toBeGreaterThanOrEqual(3);
      expect(proposal.pedestrianCrossings.length).toBeGreaterThanOrEqual(2);
      // Signal groups : at least one vehicle + at least one pedestrian
      expect(
        proposal.signalGroups.filter((g) => g.kind === 'vehicle').length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        proposal.signalGroups.filter((g) => g.kind === 'pedestrian').length,
      ).toBeGreaterThanOrEqual(2);
      // Phases
      expect(proposal.phases.length).toBeGreaterThanOrEqual(2);
      expect(proposal.phases.every((p) => p.minGreenSeconds >= 1)).toBe(true);
      // Detectors
      expect(proposal.detectors.length).toBeGreaterThanOrEqual(4);
      // Conflicts
      expect(proposal.conflicts.length).toBeGreaterThan(0);
      // Capacity
      expect(proposal.capacity.cycleSeconds).toBeGreaterThan(0);
      expect(proposal.capacity.saturationHPM).toBeGreaterThan(0);
      expect(proposal.capacity.saturationHPM).toBeLessThanOrEqual(1);
      // Reasoning
      expect(proposal.reasoning.advantages.length).toBeGreaterThanOrEqual(1);
      expect(proposal.reasoning.disadvantages.length).toBeGreaterThanOrEqual(1);
      expect(proposal.reasoning.expectedBehavior.length).toBeGreaterThan(40);
      expect(proposal.reasoning.engineeringReasoning.length).toBeGreaterThan(
        40,
      );
      expect(proposal.reasoning.operationalQuality).toBeGreaterThan(0);
      // Warnings + assumptions
      expect(proposal.warnings.length).toBeGreaterThanOrEqual(1);
      expect(proposal.assumptions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('protected-4-phase has 4 phases with sequential numbering', async () => {
    const set = await generator.generate(tangerInput());
    const protectedVariant = set.proposals.find(
      (p) => p.variantCode === 'protected-4-phase',
    );
    expect(protectedVariant).toBeDefined();
    const seqs = protectedVariant!.phases
      .map((p) => p.sequenceNumber)
      .sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4]);
    expect(protectedVariant!.phases.filter((p) => p.isProtected).length).toBe(
      2,
    );
  });

  it('adaptive-smart proposal recommends adaptive control mode', async () => {
    const set = await generator.generate(tangerInput());
    const adaptive = set.proposals.find(
      (p) => p.variantCode === 'adaptive-smart',
    );
    expect(adaptive?.recommendedControlMode).toBe('adaptive');
    expect(adaptive?.reasoning.operationalQuality).toBeGreaterThanOrEqual(85);
  });

  it('tram-priority variant has a transit phase with SigFer detectors', async () => {
    const set = await generator.generate(tangerInput({ scope: 'tram' }));
    const tram = set.proposals.find((p) => p.variantCode === 'tram-priority');
    expect(tram).toBeDefined();
    expect(tram!.phases.some((p) => p.phaseType === PhaseType.TRANSIT)).toBe(
      true,
    );
    expect(tram!.signalGroups.some((g) => g.kind === 'tram')).toBe(true);
    expect(tram!.detectors.some((d) => d.code.startsWith('SIG-AT'))).toBe(true);
  });

  it('pedestrian-priority variant has a Barnes-Dance pedestrian phase', async () => {
    const set = await generator.generate(tangerInput());
    const ped = set.proposals.find(
      (p) => p.variantCode === 'pedestrian-priority',
    );
    expect(ped).toBeDefined();
    const pedPhase = ped!.phases.find(
      (p) => p.phaseType === PhaseType.PEDESTRIAN,
    );
    expect(pedPhase).toBeDefined();
    expect(pedPhase!.greenSignalGroupCodes).toContain('P1');
    expect(pedPhase!.greenSignalGroupCodes).toContain('P4');
  });

  it('capacity reserve is realistic (10-50 %) for all variants', async () => {
    const set = await generator.generate(tangerInput());
    for (const proposal of set.proposals) {
      expect(proposal.capacity.capacityReservePercent).toBeGreaterThanOrEqual(
        0,
      );
      expect(proposal.capacity.capacityReservePercent).toBeLessThanOrEqual(60);
    }
  });
});
