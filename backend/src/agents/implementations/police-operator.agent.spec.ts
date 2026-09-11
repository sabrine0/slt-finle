import { makeAnalysis, makeContext } from '../__tests__/agent-test-helpers';
import { PoliceOperatorAgent } from './police-operator.agent';

describe('PoliceOperatorAgent', () => {
  const agent = new PoliceOperatorAgent();

  describe('metadata', () => {
    it('runs first (priority 0) and applies to every scope', () => {
      expect(agent.id).toBe('police-operator');
      expect(agent.priority).toBe(0);
      expect(agent.scopes).toEqual(['intersection', 'zone', 'city']);
    });
  });

  describe('explicit override', () => {
    it('emits a critical override on a police_override event', async () => {
      const context = makeContext({
        events: [{ type: 'police_override' }, { type: 'police_override' }],
      });

      const decision = await agent.run(context);

      expect(decision).not.toBeNull();
      expect(decision!.kind).toBe('manual_control');
      expect(decision!.severity).toBe('critical');
      expect(decision!.override).toBe(true);
      expect(decision!.payload).toMatchObject({
        source: 'event',
        eventCount: 2,
      });
    });

    it('works at city scope without needing prediction data', async () => {
      const context = makeContext({
        scope: 'city',
        scopeRef: 'city-001',
        events: [{ type: 'police_override' }],
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('manual_control');
      expect(decision?.override).toBe(true);
    });
  });

  describe('release', () => {
    it('release event takes precedence over a co-occurring police_override', async () => {
      const context = makeContext({
        events: [{ type: 'manual_release' }, { type: 'police_override' }],
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('release_manual_control');
      expect(decision?.override).toBe(false);
      expect(decision?.severity).toBe('info');
    });
  });

  describe('auto-escalation from prediction agent', () => {
    it('emits manual_control_recommended override when analysis recommends police_action', async () => {
      const context = makeContext({
        analysis: makeAnalysis({
          recommendedAction: 'police_action',
          predictedCongestionLevel: 'congestion',
          predictedTrend: 'worsening',
          riskScore: 92,
        }),
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('manual_control_recommended');
      expect(decision?.severity).toBe('critical');
      expect(decision?.override).toBe(true);
      expect(decision?.payload).toMatchObject({
        source: 'prediction-agent',
        riskScore: 92,
        predictedTrend: 'worsening',
      });
    });

    it('returns null when analysis is benign and no event is present', async () => {
      const context = makeContext({
        analysis: makeAnalysis({ recommendedAction: 'maintain' }),
      });

      const decision = await agent.run(context);

      expect(decision).toBeNull();
    });

    it('does not auto-escalate at non-intersection scope', async () => {
      const context = makeContext({
        scope: 'city',
        scopeRef: 'city-001',
        analysis: makeAnalysis({ recommendedAction: 'police_action' }),
      });

      const decision = await agent.run(context);

      expect(decision).toBeNull();
    });
  });
});
