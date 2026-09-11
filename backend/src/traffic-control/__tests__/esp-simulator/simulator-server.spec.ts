/**
 * Black-box HTTP tests for the simulator server. Hits the real
 * `node:http` server with `fetch` and asserts response codes + bodies.
 *
 * Tests don't share a server instance — each test starts its own on
 * port 0 and tears it down. tickIntervalMs is 0 so no real timers run
 * during these tests; the simulator state only advances when a request
 * arrives or the test calls `handle.simulator.tick(now)` explicitly.
 */
import { startSimulator, type SimulatorServerHandle } from './simulator-server';

const T0 = 1_700_000_000_000;

interface ApiResponse {
  status: number;
  body: unknown;
}

async function postCommand(
  handle: SimulatorServerHandle,
  body: unknown,
  authHeader?: string,
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader) headers['Authorization'] = authHeader;
  const res = await fetch(`${handle.baseUrl}/api/command`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text.length > 0 ? (JSON.parse(text) as unknown) : null,
  };
}

describe('simulator-server (HTTP black-box)', () => {
  let handle: SimulatorServerHandle;
  let mutableNow = T0;
  const nowFn = () => mutableNow;

  beforeEach(async () => {
    mutableNow = T0;
    handle = await startSimulator({ tickIntervalMs: 0, nowFn });
  });

  afterEach(async () => {
    await handle.close();
  });

  it('serves POST /api/command and returns the simulator response', async () => {
    const res = await postCommand(handle, {
      commandId: 'cmd-1',
      kind: 'force_phase',
      intersection: 'INT-CAS-001',
      params: { direction: 'NORTH', holdSeconds: 10 },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      commandId: 'cmd-1',
      status: 'applied',
    });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${handle.baseUrl}/api/unknown`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for GET on /api/command', async () => {
    const res = await fetch(`${handle.baseUrl}/api/command`, { method: 'GET' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await fetch(`${handle.baseUrl}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ this is not json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 + status:rejected for invalid kind', async () => {
    const res = await postCommand(handle, {
      commandId: 'cmd-bad',
      kind: 'wat',
      intersection: 'INT-CAS-001',
      params: {},
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'rejected',
      detail: 'unknown_kind',
    });
  });

  it('returns 200 + status:rejected for invalid direction', async () => {
    const res = await postCommand(handle, {
      commandId: 'cmd-bad',
      kind: 'force_phase',
      intersection: 'INT-CAS-001',
      params: { direction: 'WHATEVER' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'rejected',
      detail: 'invalid_direction',
    });
  });

  it('echoes commandId on duplicate requests (idempotency)', async () => {
    const first = await postCommand(handle, {
      commandId: 'dup',
      kind: 'force_phase',
      intersection: 'INT-CAS-001',
      params: { direction: 'NORTH', holdSeconds: 10 },
    });
    const second = await postCommand(handle, {
      commandId: 'dup',
      kind: 'set_manual_mode',
      intersection: 'INT-CAS-001',
      params: { enabled: true },
    });
    expect(second.body).toEqual(first.body);
  });

  it('progresses the state machine across requests', async () => {
    await postCommand(handle, {
      commandId: 'c1',
      kind: 'force_phase',
      intersection: 'INT-CAS-001',
      params: { direction: 'NORTH', holdSeconds: 10 },
    });
    expect(handle.simulator.getState()).toBe('ALL_RED_TRANSITION');

    mutableNow += 1_500;
    handle.simulator.tick(nowFn());
    expect(handle.simulator.getState()).toBe('NORMAL_NS_GREEN');
  });
});

describe('simulator-server — auth', () => {
  let handle: SimulatorServerHandle;
  const nowFn = () => T0;

  beforeEach(async () => {
    handle = await startSimulator({
      tickIntervalMs: 0,
      authToken: 'secret-token',
      nowFn,
    });
  });

  afterEach(async () => {
    await handle.close();
  });

  it('returns 401 when authToken is set but Authorization header missing', async () => {
    const res = await postCommand(handle, {
      commandId: 'c1',
      kind: 'force_phase',
      intersection: 'INT-CAS-001',
      params: { direction: 'NORTH' },
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: 'rejected',
      detail: 'unauthorized',
    });
  });

  it('returns 401 when bearer token does not match', async () => {
    const res = await postCommand(
      handle,
      {
        commandId: 'c1',
        kind: 'force_phase',
        intersection: 'INT-CAS-001',
        params: { direction: 'NORTH' },
      },
      'Bearer wrong',
    );
    expect(res.status).toBe(401);
  });

  it('accepts request with matching bearer token', async () => {
    const res = await postCommand(
      handle,
      {
        commandId: 'c1',
        kind: 'force_phase',
        intersection: 'INT-CAS-001',
        params: { direction: 'NORTH' },
      },
      'Bearer secret-token',
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'applied' });
  });
});
