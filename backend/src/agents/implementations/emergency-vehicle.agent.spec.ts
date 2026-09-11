import {
  makeAnalysis,
  makeContext,
  seedDecision,
} from '../__tests__/agent-test-helpers';
import { EmergencyVehicleAgent } from './emergency-vehicle.agent';

describe('EmergencyVehicleAgent', () => {
  const agent = new EmergencyVehicleAgent();

  describe('metadata', () => {
    it('runs after police (priority 5) and applies to every scope', () => {
      expect(agent.id).toBe('emergency-vehicle');
      expect(agent.priority).toBe(5);
      expect(agent.scopes).toEqual(['intersection', 'zone', 'city']);
    });
  });

  it('returns null when no emergency_vehicle event is present', async () => {
    const context = makeContext({ events: [] });

    expect(await agent.run(context)).toBeNull();
  });

  describe('preemption (no override active)', () => {
    it('forces a green corridor with critical override and 25s default hold', async () => {
      const context = makeContext({
        events: [
          { type: 'emergency_vehicle', payload: { direction: 'north' } },
        ],
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('force_green_corridor');
      expect(decision?.severity).toBe('critical');
      expect(decision?.override).toBe(true);
      expect(decision?.payload).toMatchObject({
        direction: 'NORTH',
        recommendedHoldSeconds: 25,
        eventCount: 1,
      });
    });

    it('extends the hold to 35s under predicted congestion', async () => {
      const context = makeContext({
        events: [{ type: 'emergency_vehicle' }],
        analysis: makeAnalysis({
          predictedCongestionLevel: 'congestion',
          riskScore: 80,
        }),
      });

      const decision = await agent.run(context);

      expect(decision?.payload?.['recommendedHoldSeconds']).toBe(35);
      expect(decision?.payload?.['direction']).toBeNull();
      expect(decision?.rationale.length).toBeGreaterThanOrEqual(2);
    });

    it('counts multiple events and uses the first explicit direction', async () => {
      const context = makeContext({
        events: [
          { type: 'emergency_vehicle' },
          { type: 'emergency_vehicle', payload: { direction: 'south' } },
          { type: 'emergency_vehicle' },
        ],
      });

      const decision = await agent.run(context);

      expect(decision?.payload).toMatchObject({
        direction: 'SOUTH',
        eventCount: 3,
      });
    });

    it('keeps default 25s hold when prediction lookup fails', async () => {
      const context = makeContext({
        events: [{ type: 'emergency_vehicle' }],
      });
      // Force the analysis path to throw — agent must swallow it.
      jest
        .spyOn(context, 'getPredictionAnalysis')
        .mockRejectedValueOnce(new Error('boom'));

      const decision = await agent.run(context);

      expect(decision?.payload?.['recommendedHoldSeconds']).toBe(25);
    });
  });

  describe('override already active', () => {
    it('downgrades to a warning acknowledgement (no override flag)', async () => {
      const context = makeContext({
        events: [{ type: 'emergency_vehicle' }],
      });
      seedDecision(
        context,
        {
          kind: 'manual_control',
          severity: 'critical',
          rationale: ['Police in control.'],
          override: true,
        },
        'police-operator',
      );

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('emergency_acknowledged');
      expect(decision?.severity).toBe('warning');
      expect(decision?.override).toBe(false);
    });
  });
});
