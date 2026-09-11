import {
  makeAnalysis,
  makeContext,
  seedDecision,
} from '../__tests__/agent-test-helpers';
import { BusPriorityAgent } from './bus-priority.agent';

describe('BusPriorityAgent', () => {
  const agent = new BusPriorityAgent();

  describe('metadata', () => {
    it('runs after preemption (priority 20) and only at intersection scope', () => {
      expect(agent.id).toBe('bus-priority');
      expect(agent.priority).toBe(20);
      expect(agent.scopes).toEqual(['intersection']);
    });
  });

  it('returns null without a bus_approach event', async () => {
    const context = makeContext({ events: [] });

    expect(await agent.run(context)).toBeNull();
  });

  describe('extension sizing', () => {
    it('uses 6s default extension when traffic is neither smooth nor congested', async () => {
      const context = makeContext({
        events: [{ type: 'bus_approach', payload: { direction: 'east' } }],
        analysis: makeAnalysis({ predictedCongestionLevel: 'pressure' }),
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('extend_green');
      expect(decision?.severity).toBe('advisory');
      expect(decision?.payload).toMatchObject({
        direction: 'EAST',
        extensionSeconds: 6,
        eventCount: 1,
      });
    });

    it('caps extension at 4s under congestion', async () => {
      const context = makeContext({
        events: [{ type: 'bus_approach' }],
        analysis: makeAnalysis({ predictedCongestionLevel: 'congestion' }),
      });

      const decision = await agent.run(context);

      expect(decision?.payload?.['extensionSeconds']).toBe(4);
    });

    it('widens extension to 10s on smooth flow', async () => {
      const context = makeContext({
        events: [{ type: 'bus_approach' }],
        analysis: makeAnalysis({ predictedCongestionLevel: 'smooth' }),
      });

      const decision = await agent.run(context);

      expect(decision?.payload?.['extensionSeconds']).toBe(10);
    });

    it('still extends with default 6s when prediction lookup fails', async () => {
      const context = makeContext({
        events: [{ type: 'bus_approach' }],
      });
      jest
        .spyOn(context, 'getPredictionAnalysis')
        .mockRejectedValueOnce(new Error('boom'));

      const decision = await agent.run(context);

      expect(decision?.payload?.['extensionSeconds']).toBe(6);
    });
  });

  describe('override already active', () => {
    it('suppresses the bus extension to an info-level note', async () => {
      const context = makeContext({
        events: [{ type: 'bus_approach' }],
      });
      seedDecision(context, {
        kind: 'force_green_corridor',
        severity: 'critical',
        rationale: ['Emergency vehicle inbound.'],
        override: true,
      });

      const decision = await agent.run(context);

      expect(decision?.kind).toBe('bus_priority_suppressed');
      expect(decision?.severity).toBe('info');
      expect(decision?.override).toBeUndefined();
    });
  });
});
