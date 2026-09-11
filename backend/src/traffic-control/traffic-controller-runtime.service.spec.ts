import { withEnv } from './__tests__/traffic-control-test-helpers';
import { MockControllerDriver } from './drivers/mock-controller-driver';
import type { ControllerDriverRegistry } from './drivers/controller-driver-registry.service';
import {
  TrafficControlExecutionService,
  type TrafficCommandView,
} from './traffic-control-execution.service';
import { TrafficControllerHardwareService } from './traffic-controller-hardware.service';
import { TrafficControllerRuntimeService } from './traffic-controller-runtime.service';

/**
 * Lifecycle test for the runtime poller:
 *   queued → markDispatched → hardware.sendCommandToController
 *          → acknowledge / markFailed
 *
 * Uses a real `MockControllerDriver` (deterministic ack) plus a fake
 * `TrafficControlExecutionService` whose only job is to record which
 * lifecycle methods were called and in what order. We deliberately do
 * NOT bring up a database here — the execution service has its own
 * unit tests for the persistence path. This file proves the poller
 * does the right thing once a command is queued.
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
  callOrder: Array<{
    method: 'listLatest' | 'markDispatched' | 'acknowledge' | 'markFailed';
    id?: string;
    note?: string;
  }>;
  /** What listLatest returns next; pop after each call. */
  queuedQueue: TrafficCommandView[][];
}

function buildFakeExecution(initial: TrafficCommandView[] = []): FakeExecution {
  const callOrder: FakeExecution['callOrder'] = [];
  const queuedQueue: TrafficCommandView[][] = [initial];

  const service = {
    listLatest: jest.fn(() => {
      callOrder.push({ method: 'listLatest' });
      return Promise.resolve(queuedQueue.shift() ?? []);
    }),
    markDispatched: jest.fn((id: string) => {
      callOrder.push({ method: 'markDispatched', id });
      return Promise.resolve(
        makeQueuedCommand({
          id,
          status: 'dispatched',
          lifecycleStage: 'dispatched',
        }),
      );
    }),
    acknowledge: jest.fn((id: string, note?: string) => {
      callOrder.push({ method: 'acknowledge', id, note });
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
      callOrder.push({ method: 'markFailed', id, note });
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

  return { service, callOrder, queuedQueue };
}

async function buildHardware(driver = new MockControllerDriver()): Promise<{
  hardware: TrafficControllerHardwareService;
  driver: MockControllerDriver;
}> {
  const registry = {
    resolve: jest.fn(() => driver),
    byName: jest.fn(() => driver),
    list: jest.fn(() => [driver]),
  } as unknown as ControllerDriverRegistry;
  const hardware = await withEnv(
    {
      CONTROLLER_TIMEOUT_MS: '500',
      CONTROLLER_RETRY_ATTEMPTS: '1',
      CONTROLLER_RETRY_BACKOFF_MS: '0',
    },
    () => Promise.resolve(new TrafficControllerHardwareService(registry)),
  );
  return { hardware, driver };
}

describe('TrafficControllerRuntimeService — command lifecycle', () => {
  it('drains a queued force_phase: listLatest → markDispatched → hardware → acknowledge', async () => {
    const fake = buildFakeExecution([makeQueuedCommand({ id: 'cmd-em' })]);
    const { hardware } = await buildHardware();
    const runtime = new TrafficControllerRuntimeService(fake.service, hardware);

    const drained = await runtime.runOnce();

    expect(drained).toBe(1);
    const methods = fake.callOrder.map((entry) => entry.method);
    expect(methods).toEqual(['listLatest', 'markDispatched', 'acknowledge']);
    const ack = fake.callOrder.find((entry) => entry.method === 'acknowledge');
    expect(ack?.id).toBe('cmd-em');
    expect(ack?.note).toMatch(/mock set active phase/);
  });

  it('drains an emergency force_phase, a bus extend_green, and a police manual_control end-to-end', async () => {
    const fake = buildFakeExecution([
      makeQueuedCommand({
        id: 'cmd-em',
        agentId: 'emergency-vehicle',
        decisionKind: 'force_green_corridor',
        kind: 'force_phase',
      }),
      makeQueuedCommand({
        id: 'cmd-bus',
        agentId: 'bus-priority',
        decisionKind: 'extend_green',
        kind: 'modify_phase_timing',
        payload: { direction: 'EAST', extensionSeconds: 6 },
      }),
      makeQueuedCommand({
        id: 'cmd-police',
        agentId: 'police-operator',
        decisionKind: 'manual_control',
        kind: 'block_automatic_control',
        payload: { source: 'event' },
      }),
    ]);
    const { hardware } = await buildHardware();
    const runtime = new TrafficControllerRuntimeService(fake.service, hardware);

    const drained = await runtime.runOnce();

    expect(drained).toBe(3);
    const acked = fake.callOrder
      .filter((entry) => entry.method === 'acknowledge')
      .map((entry) => entry.id);
    // Newest first, then reversed for FIFO drain → original order.
    expect(acked).toEqual(['cmd-police', 'cmd-bus', 'cmd-em']);
  });

  it('marks a command failed (not acknowledged) when the driver reports ok:false', async () => {
    const fake = buildFakeExecution([makeQueuedCommand({ id: 'cmd-flaky' })]);
    const driver = new MockControllerDriver();
    // Force the driver to refuse — simulate a relay-locked / cabinet-busy
    // response from the field hardware. Use mockResolvedValue (not …Once)
    // so every retry attempt also fails, giving the hardware service a
    // definitive ok:false to bubble back to the runtime poller.
    jest.spyOn(driver, 'sendForcePhase').mockResolvedValue({
      ok: false,
      detail: 'relay locked by watchdog',
    });
    const { hardware } = await buildHardware(driver);
    const runtime = new TrafficControllerRuntimeService(fake.service, hardware);

    const drained = await runtime.runOnce();

    expect(drained).toBe(0);
    const methods = fake.callOrder.map((entry) => entry.method);
    expect(methods).toContain('markFailed');
    expect(methods).not.toContain('acknowledge');
    const failed = fake.callOrder.find(
      (entry) => entry.method === 'markFailed',
    );
    expect(failed?.note).toMatch(/relay locked/);
  });

  it('skips silently when markDispatched returns null (raced by another worker)', async () => {
    const fake = buildFakeExecution([makeQueuedCommand({ id: 'cmd-raced' })]);
    // Override the implementation entirely so the simulated race
    // returns null AND still increments the spy. (mockResolvedValueOnce
    // would skip the wrapper that records callOrder, but we assert via
    // jest.fn's own .mock.calls below so the test stays correct either
    // way.)
    (fake.service.markDispatched as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve(null),
    );
    const { hardware } = await buildHardware();
    const runtime = new TrafficControllerRuntimeService(fake.service, hardware);

    const drained = await runtime.runOnce();

    expect(drained).toBe(0);
    /* eslint-disable @typescript-eslint/unbound-method --
       reading jest spies off the service object is the standard test
       pattern and never invokes them with a stale `this`. */
    expect(fake.service.listLatest).toHaveBeenCalledTimes(1);
    expect(fake.service.markDispatched).toHaveBeenCalledTimes(1);
    expect(fake.service.acknowledge).not.toHaveBeenCalled();
    expect(fake.service.markFailed).not.toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it('returns 0 when the queue is empty (no listLatest result)', async () => {
    const fake = buildFakeExecution([]);
    const { hardware } = await buildHardware();
    const runtime = new TrafficControllerRuntimeService(fake.service, hardware);

    const drained = await runtime.runOnce();

    expect(drained).toBe(0);
    expect(fake.callOrder).toEqual([{ method: 'listLatest' }]);
  });
});
