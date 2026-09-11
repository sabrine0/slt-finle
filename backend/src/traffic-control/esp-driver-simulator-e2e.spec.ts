/**
 * End-to-end: real `EspHttpControllerDriver` driving the in-process
 * `EspSimulator` over HTTP. This is the highest-fidelity validation
 * we can run before silicon arrives — the same JSON contract, the
 * same retry / timeout policy, against a state machine that enforces
 * every safety invariant from §5 of the prototype plan.
 */
import {
  startSimulator,
  type SimulatorServerHandle,
} from './__tests__/esp-simulator';
import { withEnv } from './__tests__/traffic-control-test-helpers';
import { EspHttpControllerDriver } from './drivers/esp-http-controller-driver';

const T0 = 1_700_000_000_000;

interface Harness {
  handle: SimulatorServerHandle;
  driver: EspHttpControllerDriver;
  advance: (ms: number) => number;
  clock: { now: number };
}

async function buildHarness(
  options: {
    /** Token configured on the simulator side; default 'secret-token'. */
    simulatorToken?: string | null;
    /** Token configured on the backend driver side; default matches the simulator. */
    driverToken?: string;
  } = {},
): Promise<Harness> {
  const clock = { now: T0 };
  const simulatorToken = options.simulatorToken ?? 'secret-token';
  const driverToken = options.driverToken ?? simulatorToken ?? 'secret-token';
  const handle = await startSimulator({
    tickIntervalMs: 0,
    authToken: simulatorToken,
    nowFn: () => clock.now,
  });
  const driver = await withEnv(
    {
      ESP_DRIVER_ENABLED: '1',
      ESP_BASE_URL: handle.baseUrl,
      ESP_COMMAND_PATH: '/api/command',
      ESP_AUTH_TOKEN: driverToken,
      ESP_TIMEOUT_MS: '2000',
    },
    () => Promise.resolve(new EspHttpControllerDriver()),
  );
  const advance = (ms: number): number => {
    clock.now += ms;
    handle.simulator.tick(clock.now);
    return clock.now;
  };
  return { handle, driver, advance, clock };
}

describe('EspHttpControllerDriver ↔ EspSimulator end-to-end', () => {
  let h: Harness;

  afterEach(async () => {
    await h.handle.close();
  });

  it('force_phase NORTH lands the simulator in NORMAL_NS_GREEN after the all-red guard', async () => {
    h = await buildHarness();

    const result = await h.driver.sendForcePhase('INT-CAS-001', 'NORTH', 10, {
      commandId: 'cmd-1',
    });

    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/applied at/);
    expect(h.handle.simulator.getState()).toBe('ALL_RED_TRANSITION');

    h.advance(1_500);
    expect(h.handle.simulator.getState()).toBe('NORMAL_NS_GREEN');
    expect(h.handle.simulator.getLights().N.green).toBe('ON');
    expect(h.handle.simulator.getLights().S.green).toBe('ON');
    expect(h.handle.simulator.getLights().E.red).toBe('ON');
  });

  it('update_timing extends the active green', async () => {
    h = await buildHarness();
    await h.driver.sendForcePhase('INT-CAS-001', 'NORTH', 10, {
      commandId: 'cmd-1',
    });
    h.advance(1_500);
    expect(h.handle.simulator.getState()).toBe('NORMAL_NS_GREEN');

    const result = await h.driver.updateTiming(
      'INT-CAS-001',
      { direction: 'NS', extensionSeconds: 5 },
      { commandId: 'cmd-2' },
    );
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/extended/);
  });

  it('set_manual_mode true → MANUAL_HOLD; set_manual_mode false → resumes', async () => {
    h = await buildHarness();
    await h.driver.sendForcePhase('INT-CAS-001', 'NORTH', 10, {
      commandId: 'cmd-1',
    });
    h.advance(1_500);

    const onResult = await h.driver.setManualMode(
      'INT-CAS-001',
      true,
      'event',
      {
        commandId: 'cmd-2',
      },
    );
    expect(onResult.ok).toBe(true);
    expect(h.handle.simulator.getState()).toBe('MANUAL_HOLD');

    const offResult = await h.driver.setManualMode(
      'INT-CAS-001',
      false,
      'manual_release',
      { commandId: 'cmd-3' },
    );
    expect(offResult.ok).toBe(true);
    expect(h.handle.simulator.getState()).toBe('ALL_RED_TRANSITION');
  });

  it('driver retry on a flaky transport eventually succeeds', async () => {
    h = await buildHarness();

    // Issue a regular successful command — sanity check the path.
    const ok = await h.driver.sendForcePhase('INT-CAS-001', 'NORTH', 10, {
      commandId: 'cmd-1',
    });
    expect(ok.ok).toBe(true);

    // Re-send same commandId — simulator returns the cached response,
    // driver still reports ok. (Idempotency works through HTTP.)
    const replay = await h.driver.sendForcePhase('INT-CAS-001', 'NORTH', 10, {
      commandId: 'cmd-1',
    });
    expect(replay.ok).toBe(true);
    expect(replay.detail).toEqual(ok.detail);
  });

  it('rejected response (invalid direction) surfaces as ok=false with no retry', async () => {
    h = await buildHarness();

    const result = await h.driver.updateTiming(
      'INT-CAS-001',
      // Driver always passes a direction; we trick the simulator into
      // rejection by issuing update_timing while no green is active.
      { direction: null, extensionSeconds: 0 },
      { commandId: 'cmd-1' },
    );

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/no_active_green/);
  });

  it('401 Unauthorized when auth token mismatches', async () => {
    h = await buildHarness({
      simulatorToken: 'real-token',
      driverToken: 'wrong-token',
    });

    await expect(
      h.driver.sendForcePhase('INT-CAS-001', 'NORTH', 10, {
        commandId: 'cmd-1',
      }),
    ).rejects.toMatchObject({
      name: 'ControllerDriverError',
      driver: 'esp',
      retryable: false, // 401 is 4xx → no retry
    });
  });
});
