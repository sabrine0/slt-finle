import {
  ControllerDriverError,
  type ControllerDriver,
  type ControllerDriverName,
  type ControllerProtocolMeta,
  type DispatchContext,
  type DriverResult,
  type TimingParams,
} from '../drivers/controller-driver';
import type { ControllerDriverRegistry } from '../drivers/controller-driver-registry.service';
import type { TrafficCommandView } from '../traffic-control-execution.service';

export interface FakeDriver extends ControllerDriver {
  sendForcePhase: jest.Mock<
    Promise<DriverResult>,
    [string, string | null, number, DispatchContext?]
  >;
  updateTiming: jest.Mock<
    Promise<DriverResult>,
    [string, TimingParams, DispatchContext?]
  >;
  setManualMode: jest.Mock<
    Promise<DriverResult>,
    [string, boolean, string, DispatchContext?]
  >;
}

export function makeFakeDriver(
  name: ControllerDriverName = 'mock',
  ok: DriverResult = { ok: true, detail: 'ok' },
): FakeDriver {
  const meta: ControllerProtocolMeta = { name, description: `fake-${name}` };
  return {
    meta,
    sendForcePhase: jest.fn(() => Promise.resolve(ok)),
    updateTiming: jest.fn(() => Promise.resolve(ok)),
    setManualMode: jest.fn(() => Promise.resolve(ok)),
  } as unknown as FakeDriver;
}

export function makeRegistry(
  driver: ControllerDriver,
): ControllerDriverRegistry {
  return {
    resolve: jest.fn(() => driver),
    byName: jest.fn(() => driver),
    list: jest.fn(() => [driver]),
  } as unknown as ControllerDriverRegistry;
}

export function makeCommand(
  overrides: Partial<TrafficCommandView> = {},
): TrafficCommandView {
  return {
    id: 'cmd-1',
    intersectionCode: 'INT-CAS-001',
    scope: 'intersection',
    scopeRef: 'INT-CAS-001',
    agentRunId: 'run-1',
    agentId: 'intersection-manager',
    decisionKind: 'extend_green',
    kind: 'modify_phase_timing',
    severity: 'advisory',
    override: false,
    status: 'queued',
    lifecycleStage: 'queued',
    payload: { direction: 'NORTH', extensionSeconds: 6 },
    rationale: ['Bus approach event.'],
    issuedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    resolvedAt: null,
    resolutionNote: null,
    ...overrides,
  };
}

export class RetryableError extends ControllerDriverError {
  constructor(message: string) {
    super(message, 'mock', true);
  }
}

export class FatalError extends ControllerDriverError {
  constructor(message: string) {
    super(message, 'mock', false);
  }
}

/**
 * Snapshot the env, run a callback, restore env. Useful since the
 * driver constructors latch env values at construction time.
 */
export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
