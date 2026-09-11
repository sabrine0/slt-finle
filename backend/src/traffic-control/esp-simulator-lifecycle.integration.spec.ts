import {
  startSimulator,
  type SimulatorServerHandle,
} from './__tests__/esp-simulator';
import { withEnv } from './__tests__/traffic-control-test-helpers';
import type { ControllerDriverRegistry } from './drivers/controller-driver-registry.service';
import { EspHttpControllerDriver } from './drivers/esp-http-controller-driver';
import {
  TrafficControlExecutionService,
  type TrafficCommandView,
} from './traffic-control-execution.service';
import { TrafficControllerHardwareService } from './traffic-controller-hardware.service';
import { TrafficControllerRuntimeService } from './traffic-controller-runtime.service';

/**
 * End-to-end lifecycle proof over real HTTP, using the ESP simulator
 * we already built as the field stand-in. This is the most realistic
 * test we can run pre-silicon: agents → execution mapping →
 * traffic_commands queue → runtime poller → ESP driver → simulator
 * state machine → acknowledged.
 *
 * The execution-service piece is faked for queue control — the real
 * service is unit-tested separately. What this test proves is the
 * HTTP path: a queued command lands as `applied` on the simulator and
 * comes back as `acknowledged` on the queue.
 */

const ISO = new Date('2026-05-07T11:00:00.000Z').toISOString();

function makeQueuedCommand(
  overrides: Partial<TrafficCommandView> = {},
): TrafficCommandView {
  return {
    id: 'cmd-1',
    intersectionCode: 'INT-CAS-001',
    scope: 'intersection',
    scopeRef: 'INT-CAS-001',
    agentRunId: 'run-1',
    agentId: 'emergency-vehicle',
    decisionKind: 'force_green_corridor',
    kind: 'force_phase',
    severity: 'critical',
    override: true,
    status: 'queued',
    lifecycleStage: 'queued',
    payload: { direction: 'NORTH', recommendedHoldSeconds: 30 },
    rationale: ['emergency vehicle inbound'],
    issuedAt: ISO,
    resolvedAt: null,
    resolutionNote: null,
    ...overrides,
  };
}

interface FakeExecution {
  service: TrafficControlExecutionService;
  acks: Array<{ id: string; note?: string }>;
  failures: Array<{ id: string; note: string }>;
}

function buildFakeExecution(initial: TrafficCommandView[]): FakeExecution {
  const queue: TrafficCommandView[][] = [initial];
  const acks: Array<{ id: string; note?: string }> = [];
  const failures: Array<{ id: string; note: string }> = [];
  const service = {
    listLatest: jest.fn(() => Promise.resolve(queue.shift() ?? [])),
    markDispatched: jest.fn((id: string) =>
      Promise.resolve(
        makeQueuedCommand({
          id,
          status: 'dispatched',
          lifecycleStage: 'dispatched',
        }),
      ),
    ),
    acknowledge: jest.fn((id: string, note?: string) => {
      acks.push({ id, note });
      return Promise.resolve(
        makeQueuedCommand({
          id,
          status: 'acknowledged',
          lifecycleStage: 'applied',
          resolvedAt: ISO,
          resolutionNote: note ?? null,
        }),
      );
    }),
    markFailed: jest.fn((id: string, note: string) => {
      failures.push({ id, note });
      return Promise.resolve(
        makeQueuedCommand({
          id,
          status: 'failed',
          lifecycleStage: 'failed',
          resolvedAt: ISO,
          resolutionNote: note,
        }),
      );
    }),
  } as unknown as TrafficControlExecutionService;
  return { service, acks, failures };
}

interface Harness {
  simHandle: SimulatorServerHandle;
  driver: EspHttpControllerDriver;
  hardware: TrafficControllerHardwareService;
  runtime: TrafficControllerRuntimeService;
  fake: FakeExecution;
}

async function buildHarness(initial: TrafficCommandView[]): Promise<Harness> {
  const simHandle = await startSimulator({
    tickIntervalMs: 0,
    authToken: 'bench-token',
  });
  const driver = await withEnv(
    {
      ESP_DRIVER_ENABLED: '1',
      ESP_BASE_URL: simHandle.baseUrl,
      ESP_AUTH_TOKEN: 'bench-token',
      ESP_TIMEOUT_MS: '2000',
    },
    () => Promise.resolve(new EspHttpControllerDriver()),
  );
  const registry = {
    resolve: jest.fn(() => driver),
    byName: jest.fn(() => driver),
    list: jest.fn(() => [driver]),
  } as unknown as ControllerDriverRegistry;
  const hardware = await withEnv(
    {
      CONTROLLER_TIMEOUT_MS: '2000',
      CONTROLLER_RETRY_ATTEMPTS: '1',
      CONTROLLER_RETRY_BACKOFF_MS: '0',
    },
    () => Promise.resolve(new TrafficControllerHardwareService(registry)),
  );
  const fake = buildFakeExecution(initial);
  const runtime = new TrafficControllerRuntimeService(fake.service, hardware);
  return { simHandle, driver, hardware, runtime, fake };
}

describe('ESP simulator lifecycle (HTTP) — agent → command → ESP → ack', () => {
  let h: Harness;

  afterEach(async () => {
    if (h?.simHandle) {
      await h.simHandle.close().catch(() => undefined);
    }
  });

  it('emergency force_phase: queued → ESP applied → acknowledged, simulator advances to ALL_RED_TRANSITION', async () => {
    h = await buildHarness([makeQueuedCommand({ id: 'cmd-em' })]);

    const drained = await h.runtime.runOnce();

    expect(drained).toBe(1);
    expect(h.fake.acks).toHaveLength(1);
    expect(h.fake.acks[0].id).toBe('cmd-em');
    // The detail bubbled up from the simulator → driver → hardware →
    // execution.acknowledge. Confirms the full HTTP body round-tripped.
    expect(h.fake.acks[0].note).toMatch(/applied at/);
    // And the simulator state actually moved as a result.
    expect(h.simHandle.simulator.getState()).toBe('ALL_RED_TRANSITION');
  });

  it('police manual_control over HTTP transitions the simulator into MANUAL_HOLD', async () => {
    h = await buildHarness([
      makeQueuedCommand({
        id: 'cmd-police',
        agentId: 'police-operator',
        decisionKind: 'manual_control',
        kind: 'block_automatic_control',
        payload: { source: 'event' },
      }),
    ]);

    const drained = await h.runtime.runOnce();

    expect(drained).toBe(1);
    expect(h.fake.acks).toHaveLength(1);
    expect(h.simHandle.simulator.getState()).toBe('MANUAL_HOLD');
  });

  it('rejected by simulator (invalid direction) → markFailed with detail, no ack', async () => {
    h = await buildHarness([
      makeQueuedCommand({
        id: 'cmd-bad',
        payload: { direction: 'BOTH', recommendedHoldSeconds: 30 },
      }),
    ]);

    const drained = await h.runtime.runOnce();

    expect(drained).toBe(0);
    expect(h.fake.acks).toHaveLength(0);
    expect(h.fake.failures).toHaveLength(1);
    expect(h.fake.failures[0].id).toBe('cmd-bad');
    expect(h.fake.failures[0].note).toMatch(/invalid_direction/);
  });

  it('three sequential commands (emergency → bus → police), each acknowledged via real HTTP', async () => {
    // Single simulator instance, three sequential drains. Between
    // drains we advance the sim's clock so the natural transitions
    // (ALL_RED → GREEN) settle — that's what the production tickInterval
    // does for free, but we leave it at 0 here for determinism.
    h = await buildHarness([]);

    // Emergency: force_phase NORTH from BOOT_ALL_RED → ALL_RED_TRANSITION.
    h.fake.service.listLatest = jest.fn(() =>
      Promise.resolve([
        makeQueuedCommand({
          id: 'cmd-em',
          payload: { direction: 'NORTH', recommendedHoldSeconds: 25 },
        }),
      ]),
    ) as unknown as typeof h.fake.service.listLatest;
    expect(await h.runtime.runOnce()).toBe(1);
    expect(h.simHandle.simulator.getState()).toBe('ALL_RED_TRANSITION');

    // Tick the simulator past the all-red guard so the next bus
    // update_timing has an active green to extend.
    h.simHandle.simulator.tick(Date.now() + 2_000);
    expect(h.simHandle.simulator.getState()).toBe('NORMAL_NS_GREEN');

    // Bus extends the active NS green.
    h.fake.service.listLatest = jest.fn(() =>
      Promise.resolve([
        makeQueuedCommand({
          id: 'cmd-bus',
          agentId: 'bus-priority',
          decisionKind: 'extend_green',
          kind: 'modify_phase_timing',
          payload: { direction: 'NORTH', extensionSeconds: 5 },
        }),
      ]),
    ) as unknown as typeof h.fake.service.listLatest;
    expect(await h.runtime.runOnce()).toBe(1);

    // Police flips to manual hold.
    h.fake.service.listLatest = jest.fn(() =>
      Promise.resolve([
        makeQueuedCommand({
          id: 'cmd-police',
          agentId: 'police-operator',
          decisionKind: 'manual_control',
          kind: 'block_automatic_control',
          payload: { source: 'event' },
        }),
      ]),
    ) as unknown as typeof h.fake.service.listLatest;
    expect(await h.runtime.runOnce()).toBe(1);

    // Three commands → three acknowledgements over real HTTP.
    expect(h.fake.acks.map((entry) => entry.id)).toEqual([
      'cmd-em',
      'cmd-bus',
      'cmd-police',
    ]);
    expect(h.fake.failures).toEqual([]);
    expect(h.simHandle.simulator.getState()).toBe('MANUAL_HOLD');
  });
});
