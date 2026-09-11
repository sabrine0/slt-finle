import type { ConfigType } from '@nestjs/config';

import type { CitiesService } from '../cities/cities.service';
import type appConfig from '../config/app.config';
import type { IntersectionsService } from '../intersections/intersections.service';
import type { TrafficControlExecutionService } from '../traffic-control/traffic-control-execution.service';
import type { ZonesService } from '../zones/zones.service';
import type { AgentEventBusService } from './agent-event-bus.service';
import type { AgentRunsService, AgentRunRecord } from './agent-runs.service';
import type { AgentRuntimeService } from './agent-runtime.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import type { AgentOutput, AgentRunResult, AgentScope } from './agent.types';

const NOW = new Date('2026-05-07T10:00:00.000Z').toISOString();

interface RecordedRun {
  scope: AgentScope;
  scopeRef: string;
}

function makeRun(
  scope: AgentScope,
  scopeRef: string,
  options: { actionableCodes?: string[]; outputs?: AgentOutput[] } = {},
): AgentRunResult {
  const cityManagerOutput: AgentOutput = {
    agentId: 'city-traffic-manager',
    agentType: 'global-strategy',
    scope,
    scopeRef,
    status: 'success',
    startedAt: NOW,
    finishedAt: NOW,
    durationMs: 1,
    decision: {
      kind: 'coordinate_corridors',
      severity: 'warning',
      rationale: ['fixture'],
      payload: {
        scope,
        scopeRef,
        actionableIntersectionCodes: options.actionableCodes ?? [],
      },
    },
  };
  const outputs = options.outputs ?? [cityManagerOutput];
  return {
    scope,
    scopeRef,
    horizon: 'H+15',
    generatedAt: NOW,
    durationMs: 1,
    agentCount: outputs.length,
    outputs,
    decisions: outputs
      .map((entry) => entry.decision)
      .filter((entry): entry is NonNullable<typeof entry> => entry != null),
    aggregatedSeverity: 'warning',
    finalRecommendation: outputs[0]?.decision ?? null,
  };
}

interface Harness {
  scheduler: AgentSchedulerService;
  runtime: { execute: jest.Mock };
  runs: { record: jest.Mock };
  events: { publishRun: jest.Mock };
  execution: { execute: jest.Mock };
  recorded: RecordedRun[];
}

function buildHarness(options: {
  cities?: Array<{
    id: string;
    intersectionCount: number;
    incidentCount?: number;
    averageDelaySeconds?: number;
    tone?: 'healthy' | 'watch' | 'critical';
    name?: string;
  }>;
  zones?: Array<{
    id: string;
    intersectionCount: number;
    incidentCount?: number;
    averageDelaySeconds?: number;
    tone?: 'healthy' | 'watch' | 'critical';
    name?: string;
  }>;
  /** Intersections returned by IntersectionsService.list — used as the
   * coverage pool when actionable codes don't fill the cap. */
  intersections?: Array<{
    code: string;
    incidents?: number;
    averageDelaySeconds?: number;
    queueLength?: number;
    status?: string;
    controlMode?: string;
    controllerConnectionState?: string | null;
  }>;
  /**
   * Looked up per (scope, ref) so each run can return a different
   * actionable list. Throw an Error to simulate a failed execute.
   */
  resultFor?: (scope: AgentScope, ref: string) => AgentRunResult | Error;
}): Harness {
  const recorded: RecordedRun[] = [];
  const runtime = {
    execute: jest.fn(
      (scope: AgentScope, scopeRef: string): Promise<AgentRunResult> => {
        recorded.push({ scope, scopeRef });
        const result =
          options.resultFor?.(scope, scopeRef) ?? makeRun(scope, scopeRef);
        if (result instanceof Error) return Promise.reject(result);
        return Promise.resolve(result);
      },
    ),
  };
  const runs = {
    record: jest.fn(
      (result: AgentRunResult): Promise<AgentRunRecord> =>
        Promise.resolve({
          ...result,
          id: `run-${recorded.length}`,
          trigger: 'scheduled',
          persistedAt: NOW,
        }),
    ),
  };
  const events = { publishRun: jest.fn() };
  const execution = { execute: jest.fn(() => Promise.resolve([])) };
  const cityDefaults = {
    incidentCount: 0,
    averageDelaySeconds: 0,
    tone: 'healthy' as const,
    name: 'Default',
  };
  const cities = {
    list: jest.fn(() =>
      Promise.resolve(
        (options.cities ?? [{ id: 'city-001', intersectionCount: 5 }]).map(
          (city) => ({ ...cityDefaults, ...city }),
        ),
      ),
    ),
  } as unknown as CitiesService;
  const zones = {
    list: jest.fn(() =>
      Promise.resolve(
        (options.zones ?? []).map((zone) => ({ ...cityDefaults, ...zone })),
      ),
    ),
  } as unknown as ZonesService;
  const intersections = {
    list: jest.fn(() =>
      Promise.resolve(
        (options.intersections ?? []).map((entry) => ({
          incidents: 0,
          averageDelaySeconds: 0,
          queueLength: 0,
          status: 'healthy',
          controlMode: 'adaptive',
          controllerConnectionState: 'online',
          ...entry,
        })),
      ),
    ),
  } as unknown as IntersectionsService;

  const scheduler = new AgentSchedulerService(
    runtime as unknown as AgentRuntimeService,
    runs as unknown as AgentRunsService,
    events as unknown as AgentEventBusService,
    execution as unknown as TrafficControlExecutionService,
    cities,
    zones,
    intersections,
    {} as ConfigType<typeof appConfig>,
  );

  return { scheduler, runtime, runs, events, execution, recorded };
}

describe('AgentSchedulerService — 3-phase tick', () => {
  it('runs city → zone → intersection in that order, recording each', async () => {
    const harness = buildHarness({
      cities: [{ id: 'city-001', intersectionCount: 5 }],
      zones: [{ id: 'zone-A', intersectionCount: 3 }],
      intersections: [{ code: 'INT-BASE-001' }, { code: 'INT-BASE-002' }],
      resultFor: (scope, ref) => {
        if (scope === 'city') {
          return makeRun('city', ref, { actionableCodes: ['INT-001'] });
        }
        if (scope === 'zone') {
          return makeRun('zone', ref, { actionableCodes: ['INT-002'] });
        }
        return makeRun('intersection', ref);
      },
    });

    const total = await harness.scheduler.runOnce();

    // Phase order: city → zone → intersections.
    // Within intersections: actionable codes first (city's INT-001, then
    // zone's INT-002), then coverage pool from IntersectionsService.list
    // (INT-BASE-001, INT-BASE-002) fills the remaining slots up to the cap.
    expect(harness.recorded).toEqual([
      { scope: 'city', scopeRef: 'city-001' },
      { scope: 'zone', scopeRef: 'zone-A' },
      { scope: 'intersection', scopeRef: 'INT-001' },
      { scope: 'intersection', scopeRef: 'INT-002' },
      { scope: 'intersection', scopeRef: 'INT-BASE-001' },
      { scope: 'intersection', scopeRef: 'INT-BASE-002' },
    ]);
    expect(total).toBe(6);
    expect(harness.runs.record).toHaveBeenCalledTimes(6);
    expect(harness.execution.execute).toHaveBeenCalledTimes(6);
    expect(harness.events.publishRun).toHaveBeenCalledTimes(6);
  });

  it('caps intersection runs at the configured per-tick maximum (24 by default)', async () => {
    const codes = Array.from({ length: 60 }, (_, i) => `INT-${i}`);
    const harness = buildHarness({
      cities: [{ id: 'city-001', intersectionCount: 100 }],
      resultFor: (scope, ref) =>
        scope === 'city'
          ? makeRun('city', ref, { actionableCodes: codes })
          : makeRun(scope, ref),
    });

    await harness.scheduler.runOnce();

    const intersectionRuns = harness.recorded.filter(
      (entry) => entry.scope === 'intersection',
    );
    // The default DEFAULT_INTERSECTION_TICK_CAP is 24. Actionable codes
    // win their slots first, in payload order (highest sat first).
    expect(intersectionRuns).toHaveLength(24);
    expect(intersectionRuns.map((e) => e.scopeRef)).toEqual(codes.slice(0, 24));
  });

  it('dedupes overlap between city and zone actionable lists', async () => {
    const harness = buildHarness({
      cities: [{ id: 'city-001', intersectionCount: 5 }],
      zones: [{ id: 'zone-A', intersectionCount: 3 }],
      intersections: [{ code: 'INT-Z' }],
      resultFor: (scope, ref) => {
        if (scope === 'city') {
          return makeRun('city', ref, { actionableCodes: ['INT-A', 'INT-B'] });
        }
        if (scope === 'zone') {
          // INT-B overlaps with city — should be deduped.
          return makeRun('zone', ref, { actionableCodes: ['INT-B', 'INT-C'] });
        }
        return makeRun('intersection', ref);
      },
    });

    await harness.scheduler.runOnce();

    const intersectionRuns = harness.recorded
      .filter((entry) => entry.scope === 'intersection')
      .map((entry) => entry.scopeRef);
    // Actionable (deduped: A, B, C) then coverage (INT-Z) — proves the
    // dedupe still works even when coverage fills the rest of the cap.
    expect(intersectionRuns).toEqual(['INT-A', 'INT-B', 'INT-C', 'INT-Z']);
  });

  it('fills remaining intersection slots from the ranked network when actionable codes are empty', async () => {
    const harness = buildHarness({
      cities: [{ id: 'city-001', intersectionCount: 2 }],
      intersections: [
        {
          code: 'INT-CRIT',
          incidents: 2,
          averageDelaySeconds: 120,
          queueLength: 20,
          status: 'critical',
          controllerConnectionState: 'degraded',
        },
        {
          code: 'INT-WATCH',
          incidents: 1,
          averageDelaySeconds: 45,
          queueLength: 8,
          status: 'watch',
        },
      ],
      resultFor: (scope, ref) => makeRun(scope, ref, { actionableCodes: [] }),
    });

    await harness.scheduler.runOnce();

    expect(
      harness.recorded.filter((entry) => entry.scope === 'intersection'),
    ).toEqual([
      { scope: 'intersection', scopeRef: 'INT-CRIT' },
      { scope: 'intersection', scopeRef: 'INT-WATCH' },
    ]);
  });

  it('skips zone phase silently when ZonesService.list throws', async () => {
    const harness = buildHarness({
      cities: [{ id: 'city-001', intersectionCount: 5 }],
    });
    const zones = harness.scheduler['zones'] as unknown as {
      list: jest.Mock;
    };
    zones.list.mockRejectedValueOnce(new Error('zones db down'));

    const total = await harness.scheduler.runOnce();

    expect(total).toBe(1); // only the city run was persisted.
    expect(
      harness.recorded.find((entry) => entry.scope === 'zone'),
    ).toBeUndefined();
  });

  it('one failing scope does not abort the rest of the cycle', async () => {
    const harness = buildHarness({
      cities: [
        { id: 'city-001', intersectionCount: 5 },
        { id: 'city-002', intersectionCount: 5 },
      ],
      resultFor: (scope, ref) =>
        scope === 'city' && ref === 'city-002'
          ? new Error('runtime exploded')
          : makeRun(scope, ref),
    });

    const total = await harness.scheduler.runOnce();

    expect(total).toBe(1);
    expect(harness.runs.record).toHaveBeenCalledTimes(1);
  });

  it('falls back to zero when no scopes are active', async () => {
    const harness = buildHarness({ cities: [], intersections: [] });

    const total = await harness.scheduler.runOnce();

    expect(total).toBe(0);
    expect(harness.runs.record).not.toHaveBeenCalled();
  });

  it('does NOT run intersection scope when there are no actionable codes and no known intersections', async () => {
    const harness = buildHarness({
      cities: [{ id: 'city-001', intersectionCount: 0 }],
      intersections: [],
      resultFor: (scope, ref) => makeRun(scope, ref, { actionableCodes: [] }),
    });

    await harness.scheduler.runOnce();

    expect(
      harness.recorded.find((entry) => entry.scope === 'intersection'),
    ).toBeUndefined();
  });
});
