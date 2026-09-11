import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { EspSimulator } from './state-machine';

/**
 * Thin HTTP wrapper around the EspSimulator state machine. Exposes
 * exactly one route — `POST /api/command` — that consumes the JSON
 * contract documented in
 * docs/esp32-led-prototype-plan.md §6 / §9 and replies in the shape
 * defined in docs/esp32-prototype-decisions.md #12 / #13.
 *
 * Auth: optional Bearer token (`authToken` option). When set, requests
 * without a matching `Authorization` header receive HTTP 401.
 *
 * Bodies that fail to parse return HTTP 400; well-formed but invalid
 * commands return HTTP 200 with `status: "rejected"` so the backend
 * driver's existing "rejected → no retry" behaviour kicks in.
 *
 * The wrapper drives the simulator's `tick()` on a 100 ms interval so
 * the state machine progresses without HTTP traffic. Tests can also
 * call `tick(now)` directly through the returned `simulator` handle.
 */

export interface ActivityRecord {
  at: string;
  kind: string;
  intersection: string;
  commandId: string;
  status: 'applied' | 'rejected';
  detail: string;
  httpStatus: number;
}

export interface SimulatorServerOptions {
  authToken?: string | null;
  /** Tick interval in ms. Tests typically pass 0 to disable the timer. */
  tickIntervalMs?: number;
  /** Override the wall clock — tests use a controlled `now` source. */
  nowFn?: () => number;
  /** Bind port. 0 picks a random free port (default for tests). */
  port?: number;
  /** Bind host. Default `127.0.0.1`. Pass `0.0.0.0` to expose to LAN. */
  host?: string;
  /**
   * Optional callback invoked once per request. Used by the CLI to
   * print activity to stdout; tests can attach a spy to assert calls.
   */
  onActivity?: (record: ActivityRecord) => void;
}

export interface SimulatorServerHandle {
  port: number;
  host: string;
  baseUrl: string;
  simulator: EspSimulator;
  close(): Promise<void>;
}

const DEFAULT_TICK_INTERVAL_MS = 100;
const DEFAULT_HOST = '127.0.0.1';

export async function startSimulator(
  options: SimulatorServerOptions = {},
): Promise<SimulatorServerHandle> {
  const nowFn = options.nowFn ?? Date.now;
  const simulator = new EspSimulator({
    now: nowFn(),
    authToken: options.authToken ?? null,
  });

  const tickInterval = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  let tickTimer: NodeJS.Timeout | null = null;
  if (tickInterval > 0) {
    tickTimer = setInterval(() => simulator.tick(nowFn()), tickInterval);
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res, simulator, nowFn, options.onActivity).catch(
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: message }));
      },
    );
  });

  const host = options.host ?? DEFAULT_HOST;
  const requestedPort = options.port ?? 0;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const port = address.port;

  return {
    port,
    host,
    baseUrl: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`,
    simulator,
    close: () =>
      new Promise<void>((resolve) => {
        if (tickTimer !== null) clearInterval(tickTimer);
        server.close(() => resolve());
      }),
  };
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  simulator: EspSimulator,
  nowFn: () => number,
  onActivity?: (record: ActivityRecord) => void,
): Promise<void> {
  // Read-only introspection route. The command contract below is
  // unchanged; this simply lets a bench/dashboard render the lamp
  // matrix the way a real board's debug endpoint would.
  if (req.method === 'GET' && req.url === '/api/state') {
    const now = nowFn();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(
      JSON.stringify({
        state: simulator.getState(),
        lights: simulator.getLights(),
        diagnostics: simulator.getDiagnostics(now),
      }),
    );
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/command') {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  const body = await readBody(req);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'malformed_json' }));
    return;
  }
  if (parsed === null || typeof parsed !== 'object') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'malformed_body' }));
    return;
  }

  const auth = req.headers['authorization'];
  const authHeader = typeof auth === 'string' ? auth : undefined;
  const response = simulator.dispatch(
    parsed as Parameters<EspSimulator['dispatch']>[0],
    nowFn(),
    authHeader,
  );

  let httpStatus = 200;
  if (response.status === 'rejected' && response.detail === 'unauthorized') {
    httpStatus = 401;
  }
  res.statusCode = httpStatus;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(response));

  if (onActivity) {
    const reqShape = parsed as { kind?: unknown; intersection?: unknown };
    onActivity({
      at: new Date(nowFn()).toISOString(),
      kind: typeof reqShape.kind === 'string' ? reqShape.kind : 'unknown',
      intersection:
        typeof reqShape.intersection === 'string'
          ? reqShape.intersection
          : 'unknown',
      commandId: response.commandId,
      status: response.status,
      detail: response.detail,
      httpStatus,
    });
  }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}
