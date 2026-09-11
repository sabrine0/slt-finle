/**
 * Standalone CLI for the ESP32 simulator.
 *
 * Run with:
 *   npm run sim:esp                     # from backend/
 *   ESP_SIM_PORT=9000 npm run sim:esp   # custom port
 *
 * The simulator binds 127.0.0.1 by default. Set ESP_SIM_HOST=0.0.0.0
 * to expose it on the LAN (only safe inside a trusted network — there
 * is no TLS).
 *
 * The process logs each command to stdout in single-line JSON so it is
 * easy to grep, pipe to `jq`, or capture in an integration log.
 *
 * Shutdown: SIGINT (Ctrl-C) or SIGTERM cleanly stops the HTTP server
 * and the watchdog tick loop.
 */
import {
  startSimulator,
  type ActivityRecord,
  type SimulatorServerHandle,
} from './simulator-server';

interface CliConfig {
  port: number;
  host: string;
  authToken: string | null;
  tickIntervalMs: number;
}

function readConfig(env: NodeJS.ProcessEnv): CliConfig {
  const port = parseIntEnv(env.ESP_SIM_PORT, 8080);
  const host = env.ESP_SIM_HOST?.trim() || '127.0.0.1';
  const authTokenRaw = env.ESP_SIM_AUTH_TOKEN?.trim();
  const authToken =
    authTokenRaw && authTokenRaw.length > 0 ? authTokenRaw : null;
  const tickIntervalMs = parseIntEnv(env.ESP_SIM_TICK_INTERVAL_MS, 100);
  return { port, host, authToken, tickIntervalMs };
}

function parseIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function logActivity(record: ActivityRecord): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function logBanner(handle: SimulatorServerHandle, config: CliConfig): void {
  const lines = [
    '─────────────────────────────────────────────────────',
    ' ESP32 simulator — STLS bench prototype',
    '─────────────────────────────────────────────────────',
    ` Listening on : ${handle.baseUrl}`,
    `              (host=${handle.host}, port=${handle.port})`,
    ` Auth         : ${config.authToken ? 'Bearer required' : 'open (no token)'}`,
    ` Tick         : ${config.tickIntervalMs} ms`,
    ` Endpoint     : POST /api/command`,
    '',
    ' Backend env to point EspHttpControllerDriver here:',
    '   CONTROLLER_DRIVER=esp',
    '   ESP_DRIVER_ENABLED=1',
    `   ESP_BASE_URL=${handle.baseUrl}`,
    config.authToken
      ? `   ESP_AUTH_TOKEN=${config.authToken}`
      : '   # ESP_AUTH_TOKEN not set (simulator runs without auth)',
    '─────────────────────────────────────────────────────',
    ' Press Ctrl-C to stop. Each command will log a JSON',
    ' line to stdout.',
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

async function main(): Promise<void> {
  const config = readConfig(process.env);

  const handle = await startSimulator({
    port: config.port,
    host: config.host,
    authToken: config.authToken,
    tickIntervalMs: config.tickIntervalMs,
    onActivity: logActivity,
  });

  logBanner(handle, config);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`\nReceived ${signal} — shutting down…\n`);
    handle
      .close()
      .then(() => {
        process.stdout.write('Goodbye.\n');
        process.exit(0);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Shutdown error: ${message}\n`);
        process.exit(1);
      });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
