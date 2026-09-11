import {
  buildStubServices,
  makeAggregated,
  makeAnalysis,
  makeHotspot,
  makeIntersectionSnapshot,
  makeMetrics,
  makeScopeSnapshot,
} from './__tests__/agent-test-helpers';
import { AgentRegistryService } from './agent-registry.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { BusPriorityAgent } from './implementations/bus-priority.agent';
import { CityTrafficManagerAgent } from './implementations/city-traffic-manager.agent';
import { EmergencyVehicleAgent } from './implementations/emergency-vehicle.agent';
import { IntersectionManagerAgent } from './implementations/intersection-manager.agent';
import { PoliceOperatorAgent } from './implementations/police-operator.agent';

/**
 * End-to-end conflict resolution: all 5 agents wired into the real
 * runtime + registry, fed stubbed prediction services. Verifies the
 * priority ladder police > emergency > bus and the override
 * suppression chain through to the IntersectionManagerAgent.
 */
function buildRuntime(
  servicesOverrides: Parameters<typeof buildStubServices>[0] = {},
) {
  const registry = new AgentRegistryService();
  registry.register(new PoliceOperatorAgent());
  registry.register(new EmergencyVehicleAgent());
  registry.register(new BusPriorityAgent());
  registry.register(new IntersectionManagerAgent());
  registry.register(new CityTrafficManagerAgent());

  const services = buildStubServices(servicesOverrides);
  // AgentRuntimeService unpacks individual services from its
  // constructor, so pass each one positionally.
  const runtime = new AgentRuntimeService(
    registry,
    services.metricsService,
    services.snapshotsService,
    services.predictionAgent,
  );
  return { registry, runtime };
}

describe('Agent runtime — conflict resolution', () => {
  describe('priority ordering', () => {
    it('runs intersection agents in priority asc: police, emergency, bus, intersection-manager', () => {
      const { registry } = buildRuntime();
      const order = registry.forScope('intersection').map((a) => a.id);

      expect(order).toEqual([
        'police-operator',
        'emergency-vehicle',
        'bus-priority',
        'intersection-manager',
      ]);
    });

    it('only city-traffic-manager (and police) apply at city scope', () => {
      const { registry } = buildRuntime();
      const order = registry.forScope('city').map((a) => a.id);

      expect(order).toEqual([
        'police-operator',
        'emergency-vehicle',
        'city-traffic-manager',
      ]);
    });
  });

  describe('police > emergency > bus suppression chain', () => {
    it('police override suppresses emergency, bus, and intersection-manager', async () => {
      const { runtime } = buildRuntime({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'pressure',
          recommendedAction: 'monitor',
        }),
      });

      const result = await runtime.execute('intersection', 'INT-CAS-001', {
        events: [
          { type: 'police_override' },
          { type: 'emergency_vehicle' },
          { type: 'bus_approach' },
        ],
      });

      const byAgent = Object.fromEntries(
        result.outputs.map((output) => [output.agentId, output]),
      );

      expect(byAgent['police-operator'].decision?.kind).toBe('manual_control');
      expect(byAgent['police-operator'].decision?.override).toBe(true);

      expect(byAgent['emergency-vehicle'].decision?.kind).toBe(
        'emergency_acknowledged',
      );
      expect(byAgent['emergency-vehicle'].decision?.override).toBe(false);

      expect(byAgent['bus-priority'].decision?.kind).toBe(
        'bus_priority_suppressed',
      );

      expect(byAgent['intersection-manager'].decision?.kind).toBe(
        'control_suppressed',
      );

      expect(result.aggregatedSeverity).toBe('critical');
      expect(result.finalRecommendation?.kind).toBe('manual_control');
    });

    it('without police, emergency override suppresses bus and intersection-manager', async () => {
      const { runtime } = buildRuntime();

      const result = await runtime.execute('intersection', 'INT-CAS-001', {
        events: [
          { type: 'emergency_vehicle', payload: { direction: 'north' } },
          { type: 'bus_approach' },
        ],
      });

      const byAgent = Object.fromEntries(
        result.outputs.map((output) => [output.agentId, output]),
      );

      expect(byAgent['police-operator'].status).toBe('skipped');
      expect(byAgent['emergency-vehicle'].decision?.kind).toBe(
        'force_green_corridor',
      );
      expect(byAgent['emergency-vehicle'].decision?.override).toBe(true);
      expect(byAgent['bus-priority'].decision?.kind).toBe(
        'bus_priority_suppressed',
      );
      expect(byAgent['intersection-manager'].decision?.kind).toBe(
        'control_suppressed',
      );

      expect(result.finalRecommendation?.kind).toBe('force_green_corridor');
    });

    it('bus alone runs as advisory, intersection-manager runs normally', async () => {
      const { runtime } = buildRuntime({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'pressure',
          recommendedAction: 'increase_green',
          riskScore: 55,
        }),
      });

      const result = await runtime.execute('intersection', 'INT-CAS-001', {
        events: [{ type: 'bus_approach' }],
      });

      const byAgent = Object.fromEntries(
        result.outputs.map((output) => [output.agentId, output]),
      );

      expect(byAgent['police-operator'].status).toBe('skipped');
      expect(byAgent['emergency-vehicle'].status).toBe('skipped');
      expect(byAgent['bus-priority'].decision?.kind).toBe('extend_green');
      expect(byAgent['bus-priority'].decision?.severity).toBe('advisory');
      expect(byAgent['intersection-manager'].decision?.kind).toBe(
        'increase_green_dominant',
      );

      // Both decisions are advisory — runtime ties on severity, breaks
      // by override flag (none here), then by run order. Bus runs first.
      expect(result.aggregatedSeverity).toBe('advisory');
      expect(result.finalRecommendation?.kind).toBe('extend_green');
    });

    it('manual_release event clears the override even if police_override is also present', async () => {
      const { runtime } = buildRuntime({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'smooth',
          recommendedAction: 'maintain',
        }),
      });

      const result = await runtime.execute('intersection', 'INT-CAS-001', {
        events: [
          { type: 'manual_release' },
          { type: 'police_override' },
          { type: 'bus_approach' },
        ],
      });

      const byAgent = Object.fromEntries(
        result.outputs.map((output) => [output.agentId, output]),
      );

      expect(byAgent['police-operator'].decision?.kind).toBe(
        'release_manual_control',
      );
      expect(byAgent['police-operator'].decision?.override).toBe(false);

      // No override is active → bus extends green, intersection-manager
      // emits its normal control decision.
      expect(byAgent['bus-priority'].decision?.kind).toBe('extend_green');
      expect(byAgent['intersection-manager'].decision?.kind).toBe(
        'maintain_plan',
      );
    });
  });

  describe('runtime aggregation', () => {
    it('picks the highest-severity decision; ties broken by override then run order', async () => {
      // Police override (critical+override) vs emergency (critical+override).
      // Police runs first → wins.
      const { runtime } = buildRuntime();

      const result = await runtime.execute('intersection', 'INT-CAS-001', {
        events: [{ type: 'police_override' }, { type: 'emergency_vehicle' }],
      });

      expect(result.finalRecommendation?.kind).toBe('manual_control');
    });

    it('aggregatedSeverity reflects the worst severity emitted in the run', async () => {
      const { runtime } = buildRuntime({
        analysis: makeAnalysis({
          predictedCongestionLevel: 'congestion',
          recommendedAction: 'extend_cycle',
          riskScore: 70,
        }),
      });

      const result = await runtime.execute('intersection', 'INT-CAS-001', {
        // No events — only intersection-manager emits a decision (warning).
        events: [],
      });

      expect(result.aggregatedSeverity).toBe('warning');
      expect(result.finalRecommendation?.kind).toBe('extend_cycle');
    });

    it('city scope: police override wins the final pick over a critical city strategy', async () => {
      const { runtime } = buildRuntime({
        scopeSnapshot: makeScopeSnapshot({
          congestionLevel: 'congestion',
          averageSaturation: 0.95,
          aggregatedMetrics: makeAggregated({ averageSaturation: 0.95 }),
          hotspots: [
            makeHotspot({
              intersectionId: 'INT-A',
              saturationForecast: 0.95,
              trafficState: 'congestion',
              metrics: makeMetrics({ saturation: 0.95 }),
            }),
            makeHotspot({
              intersectionId: 'INT-B',
              saturationForecast: 0.92,
              trafficState: 'congestion',
              metrics: makeMetrics({ saturation: 0.92 }),
            }),
          ],
        }),
      });

      const result = await runtime.execute('city', 'city-001', {
        events: [{ type: 'police_override' }],
      });

      const byAgent = Object.fromEntries(
        result.outputs.map((output) => [output.agentId, output]),
      );
      expect(byAgent['police-operator'].decision?.kind).toBe('manual_control');
      // CityTrafficManagerAgent does not check override — it still
      // emits its strategy. Both decisions are critical; police runs
      // first, so its override wins the final tie-break.
      expect(byAgent['city-traffic-manager'].decision?.kind).toBe(
        'dispatch_global',
      );
      expect(result.finalRecommendation?.kind).toBe('manual_control');
    });
  });

  describe('per-agent fault isolation', () => {
    it('marks an agent failed without crashing the run', async () => {
      const { registry, runtime } = buildRuntime();
      // Force the bus agent to throw.
      jest
        .spyOn(registry.byIdOrUndefined('bus-priority')!, 'run')
        .mockRejectedValueOnce(new Error('boom'));

      const result = await runtime.execute('intersection', 'INT-CAS-001', {
        events: [{ type: 'bus_approach' }],
      });

      const bus = result.outputs.find(
        (entry) => entry.agentId === 'bus-priority',
      );
      expect(bus?.status).toBe('failed');
      expect(bus?.error).toBe('boom');
      expect(bus?.decision).toBeNull();
      // Other agents still ran.
      expect(
        result.outputs.find((e) => e.agentId === 'intersection-manager')
          ?.status,
      ).toBe('success');
    });
  });

  it('respects agentIds filter', async () => {
    const { runtime } = buildRuntime();

    const result = await runtime.execute('intersection', 'INT-CAS-001', {
      events: [{ type: 'bus_approach' }],
      agentIds: ['bus-priority'],
    });

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].agentId).toBe('bus-priority');
  });

  it('uses the snapshot for the requested intersection (passes through scopeRef)', async () => {
    const calls: string[] = [];
    const { runtime } = buildRuntime({
      intersectionSnapshotFor: (code) => {
        calls.push(code);
        return makeIntersectionSnapshot({ intersectionId: code });
      },
    });

    await runtime.execute('intersection', 'INT-CAS-042', { events: [] });

    expect(calls).toContain('INT-CAS-042');
  });
});
