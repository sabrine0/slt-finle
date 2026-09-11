import {
  makeAnalysis,
  makeContext,
  seedDecision,
} from '../__tests__/agent-test-helpers';
import { IntersectionManagerAgent } from './intersection-manager.agent';

describe('IntersectionManagerAgent', () => {
  const agent = new IntersectionManagerAgent();

  describe('metadata', () => {
    it('runs after preemption / priority agents (priority 30) at intersection scope', () => {
      expect(agent.id).toBe('intersection-manager');
      expect(agent.priority).toBe(30);
      expect(agent.scopes).toEqual(['intersection']);
    });
  });

  describe('override already active', () => {
    it('suppresses control with an info-level note', async () => {
      const context = makeContext();
      seedDecision(context, {
        kind: 'manual_control',
        severity: 'critical',
        rationale: ['Police in control.'],
        override: true,
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('control_suppressed');
      expect(decision?.severity).toBe('info');
    });
  });

  describe('action mapping', () => {
    it('maintains plan on smooth/maintain analysis', async () => {
      const context = makeContext({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'smooth',
          recommendedAction: 'maintain',
        }),
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('maintain_plan');
      expect(decision?.severity).toBe('info');
    });

    it('monitors plan on pressure/monitor analysis', async () => {
      const context = makeContext({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'pressure',
          recommendedAction: 'monitor',
        }),
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('monitor_plan');
      expect(decision?.severity).toBe('advisory');
    });

    it('biases green to dominant approach on pressure/increase_green', async () => {
      const context = makeContext({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'pressure',
          recommendedAction: 'increase_green',
        }),
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('increase_green_dominant');
      expect(decision?.severity).toBe('advisory');
      expect(decision?.payload?.['biasFactor']).toBe(0.4);
    });

    it('extends cycle on congestion/extend_cycle', async () => {
      const context = makeContext({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'congestion',
          recommendedAction: 'extend_cycle',
          riskScore: 70,
        }),
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('extend_cycle');
      expect(decision?.severity).toBe('warning');
      expect(decision?.payload).toMatchObject({
        cycleExtensionSeconds: 20,
        biasFactor: 0.65,
      });
    });

    it('requests manual control on police_action recommendation', async () => {
      const context = makeContext({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'congestion',
          recommendedAction: 'police_action',
          riskScore: 95,
        }),
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('request_manual_control');
      expect(decision?.severity).toBe('warning');
    });

    it('returns no_data fallback when analysis says no_data', async () => {
      const context = makeContext({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'smooth',
          recommendedAction: 'no_data',
          rationale: ['No observations.'],
        }),
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('no_data');
      expect(decision?.severity).toBe('info');
    });
  });
});
