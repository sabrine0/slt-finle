/**
 * Lifecycle tests — restart, dedup-after-restart, network flicker.
 *
 * Mirrors the bench scenarios that operators will exercise on real
 * ESP32 silicon: rebooting the firmware mid-cycle, replaying
 * commandIds across reboots, and recovering from transient network
 * outages.
 */
import { withEnv } from '../traffic-control-test-helpers';
import { EspHttpControllerDriver } from '../../drivers/esp-http-controller-driver';
import { startSimulator, type SimulatorServerHandle } from './simulator-server';

const T0 = 1_700_000_000_000;

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

async function postCommand(
  baseUrl: string,
  body: Record<string, unknown>,
  authHeader?: string,
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader) headers['Authorization'] = authHeader;
  const res = await fetch(`${baseUrl}/api/command`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

describe('simulator lifecycle — restart', () => {
  it('a fresh simulator instance always boots into BOOT_ALL_RED with no carry-over state', async () => {
    let now = T0;
    const handle1 = await startSimulator({
      tickIntervalMs: 0,
      nowFn: () => now,
    });

    // Drive the first instance into a non-default state.
    await postCommand(handle1.baseUrl, {
      commandId: 'cmd-1',
      kind: 'force_phase',
      intersection: 'INT-CAS-001',
      params: { direction: 'NORTH', holdSeconds: 10 },
    });
    now += 1_500;
    handle1.simulator.tick(now);
    expect(handle1.simulator.getState()).toBe('NORMAL_NS_GREEN');
    await handle1.close();

    // Stand up a second instance — same process, different simulator.
    const handle2 = await startSimulator({
      tickIntervalMs: 0,
      nowFn: () => now,
    });
    expect(handle2.simulator.getState()).toBe('BOOT_ALL_RED');
    const lights = handle2.simulator.getLights();
    expect(lights.N.red).toBe('ON');
    expect(lights.S.red).toBe('ON');
    expect(lights.E.red).toBe('ON');
    expect(lights.W.red).toBe('ON');
    expect(lights.N.green).toBe('OFF');
    await handle2.close();
  });

  it('the new instance does not inherit override state from the previous one', async () => {
    const handle1 = await startSimulator({
      tickIntervalMs: 0,
      nowFn: () => T0,
    });
    handle1.simulator.pressOverride(T0);
    expect(handle1.simulator.getState()).toBe('FAILSAFE_FLASH');
    await handle1.close();

    const handle2 = await startSimulator({
      tickIntervalMs: 0,
      nowFn: () => T0,
    });
    expect(handle2.simulator.getState()).toBe('BOOT_ALL_RED');
    expect(handle2.simulator.getDiagnostics(T0).overrideActive).toBe(false);
    await handle2.close();
  });
});

describe('simulator lifecycle — commandId dedup across restart', () => {
  it('same commandId is processed afresh on a new simulator instance (cache is in-memory only)', async () => {
    const now1 = T0;
    const handle1 = await startSimulator({
      tickIntervalMs: 0,
      nowFn: () => now1,
    });
    const first = await postCommand(handle1.baseUrl, {
      commandId: 'shared-id',
      kind: 'force_phase',
      intersection: 'INT-CAS-001',
      params: { direction: 'NORTH', holdSeconds: 10 },
    });
    expect(first.body.status).toBe('applied');
    expect(first.body.appliedAt).toBe(new Date(now1).toISOString());

    // Replay against the same instance — cached, identical response.
    const replaySame = await postCommand(handle1.baseUrl, {
      commandId: 'shared-id',
      kind: 'force_phase',
      intersection: 'INT-CAS-001',
      params: { direction: 'NORTH', holdSeconds: 10 },
    });
    expect(replaySame.body).toEqual(first.body);

    await handle1.close();

    // New instance, T0 + 5 minutes — well past IDEMPOTENCY_TTL_MS, but
    // also irrelevant since the cache was thrown away with handle1.
    const now2 = T0 + 300_000;
    const handle2 = await startSimulator({
      tickIntervalMs: 0,
      nowFn: () => now2,
    });
    const replayNew = await postCommand(handle2.baseUrl, {
      commandId: 'shared-id',
      kind: 'force_phase',
      intersection: 'INT-CAS-001',
      params: { direction: 'NORTH', holdSeconds: 10 },
    });
    // Same status, but appliedAt reflects the new instance's clock —
    // proving the request was processed afresh, not served from a
    // surviving cache entry.
    expect(replayNew.body.status).toBe('applied');
    expect(replayNew.body.appliedAt).not.toBe(first.body.appliedAt);
    expect(replayNew.body.appliedAt).toBe(new Date(now2).toISOString());

    await handle2.close();
  });
});

describe('simulator lifecycle — network flicker', () => {
  let handle: SimulatorServerHandle | null = null;

  afterEach(async () => {
    if (handle) {
      await handle.close().catch(() => undefined);
      handle = null;
    }
  });

  it('driver throws RETRYABLE error when the simulator is unreachable', async () => {
    // Boot a simulator so we can capture a real port, then close it
    // immediately. The URL is now a known-dead endpoint.
    const ephemeral = await startSimulator({ tickIntervalMs: 0 });
    const baseUrl = ephemeral.baseUrl;
    await ephemeral.close();

    const driver = await withEnv(
      {
        ESP_DRIVER_ENABLED: '1',
        ESP_BASE_URL: baseUrl,
        ESP_TIMEOUT_MS: '500',
      },
      () => Promise.resolve(new EspHttpControllerDriver()),
    );

    await expect(
      driver.sendForcePhase('INT-CAS-001', null, 25, { commandId: 'cmd-1' }),
    ).rejects.toMatchObject({
      name: 'ControllerDriverError',
      driver: 'esp',
      retryable: true,
    });
  });

  it('driver recovers cleanly once a simulator is back online (typical flicker)', async () => {
    // Start a simulator and prove the driver works.
    handle = await startSimulator({ tickIntervalMs: 0 });
    const baseUrl1 = handle.baseUrl;
    let driver = await withEnv(
      {
        ESP_DRIVER_ENABLED: '1',
        ESP_BASE_URL: baseUrl1,
        ESP_TIMEOUT_MS: '1000',
      },
      () => Promise.resolve(new EspHttpControllerDriver()),
    );
    const before = await driver.sendForcePhase('INT-CAS-001', 'NORTH', 25, {
      commandId: 'cmd-before',
    });
    expect(before.ok).toBe(true);

    // Simulate the ESP losing Wi-Fi: shut the server. In the firmware
    // this is a Wi-Fi drop — same effect from the driver's POV
    // (connection refused / timeout).
    await handle.close();
    handle = null;

    // The driver — still pointing at baseUrl1 — now fails. The
    // hardware service's retry loop would normally absorb a brief
    // outage; we exercise the raw driver here so the test is
    // deterministic.
    await expect(
      driver.sendForcePhase('INT-CAS-001', 'NORTH', 25, {
        commandId: 'cmd-during-outage',
      }),
    ).rejects.toMatchObject({ retryable: true });

    // Wi-Fi comes back — start a new simulator (different port,
    // because OS scheduling makes same-port rebind racy in tests).
    // In production the firmware reconnects on the same address.
    handle = await startSimulator({ tickIntervalMs: 0 });
    const baseUrl2 = handle.baseUrl;
    driver = await withEnv(
      {
        ESP_DRIVER_ENABLED: '1',
        ESP_BASE_URL: baseUrl2,
        ESP_TIMEOUT_MS: '1000',
      },
      () => Promise.resolve(new EspHttpControllerDriver()),
    );
    const after = await driver.sendForcePhase('INT-CAS-001', 'NORTH', 25, {
      commandId: 'cmd-after',
    });
    expect(after.ok).toBe(true);
    // Different commandId → different detail string. Confirms we hit
    // a freshly-booted simulator instance, not a cached response.
    expect(after.detail).not.toEqual(before.detail);
  });

  it('a 401 from the simulator surfaces as a non-retryable error to the driver (auth flicker)', async () => {
    handle = await startSimulator({
      tickIntervalMs: 0,
      authToken: 'good-token',
    });
    const driver = await withEnv(
      {
        ESP_DRIVER_ENABLED: '1',
        ESP_BASE_URL: handle.baseUrl,
        ESP_AUTH_TOKEN: 'wrong-token',
        ESP_TIMEOUT_MS: '500',
      },
      () => Promise.resolve(new EspHttpControllerDriver()),
    );

    await expect(
      driver.sendForcePhase('INT-CAS-001', null, 25, { commandId: 'cmd-1' }),
    ).rejects.toMatchObject({
      name: 'ControllerDriverError',
      driver: 'esp',
      retryable: false,
    });
  });
});
