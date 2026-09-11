#!/usr/bin/env node
/**
 * STLS virtual bench.
 *
 *   npm run bench
 *
 * Boots every layer of the platform, then drives scripted traffic
 * situations through it and streams what actually happened to a live
 * dashboard on http://127.0.0.1:9100.
 *
 * The whole point is that nothing is mocked at the bench level. The
 * bench writes real traffic observations into the database, asks the
 * real AI agents to run, and lets the real execution path deliver
 * commands to the virtual ESP32 board. Every number on the dashboard
 * is read back out of the running system.
 *
 * Layers started (each only if its port is free):
 *   5433  PGlite socket bridge      .pglite-bridge.mjs
 *   4010  NestJS backend            backend/dist/main
 *   8090  ESP32 simulator           backend npm run sim:esp
 *   3000  Next.js frontend          frontend npm run dev      (optional)
 *   9100  this bench + dashboard
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scenarios } from './scenarios.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BACKEND = path.join(ROOT, 'backend');

// `pg` lives in the backend's node_modules, not the repo root.
const backendRequire = createRequire(path.join(BACKEND, 'package.json'));
const { Client } = backendRequire('pg');

const PORTS = {
  bridge: 5433,
  backend: 4010,
  esp: 8090,
  frontend: 3000,
  bench: Number(process.env.BENCH_PORT ?? 9100),
};

const DB = {
  host: '127.0.0.1',
  port: PORTS.bridge,
  user: 'stls',
  password: 'stls_dev_password',
  database: 'stls_hybrid',
};

const CREDS = {
  email: process.env.BENCH_EMAIL ?? 'admin@stls.local',
  password: process.env.BENCH_PASSWORD ?? 'ChangeMe123!',
};

const API = `http://127.0.0.1:${PORTS.backend}`;
const ESP = `http://127.0.0.1:${PORTS.esp}`;
const DEAD_ESP = 'http://127.0.0.1:9';

const WITH_FRONTEND = !process.argv.includes('--no-frontend');
const AUTO_RUN = process.argv.includes('--run-all');

const LOG_DIR = path.join(ROOT, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────
// tiny helpers
// ─────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portOpen(port, host = '127.0.0.1', timeout = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function waitForPort(port, label, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true;
    await sleep(1000);
  }
  throw new Error(`${label} did not open port ${port} within ${timeoutMs} ms`);
}

/**
 * The dashboard port is often squatted by unrelated dev tooling, so walk
 * forward until we find one that is genuinely free rather than dying with
 * EADDRINUSE after the whole stack is already up.
 */
async function findFreePort(start, attempts = 40) {
  for (let port = start; port < start + attempts; port += 1) {
    if (!(await portOpen(port, '127.0.0.1', 300))) return port;
  }
  throw new Error(`no free port found in ${start}..${start + attempts}`);
}

/** fetch with a hard timeout so a dead endpoint can never hang the bench. */
async function fetchJson(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

const children = [];

function launch(label, command, args, cwd, logFile, env = {}) {
  const out = fs.openSync(path.join(LOG_DIR, logFile), 'a');
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', out, out],
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  child.on('exit', (code) => {
    if (!shuttingDown) {
      state.stack[label] = { ...state.stack[label], up: false, note: `exited (${code})` };
      broadcast('stack', state.stack);
    }
  });
  children.push({ label, child });
  return child;
}

let shuttingDown = false;

// ─────────────────────────────────────────────────────────────────────
// bench state + SSE
// ─────────────────────────────────────────────────────────────────────

const state = {
  startedAt: new Date().toISOString(),
  stack: {},
  scenarios: scenarios.map((s) => ({
    id: s.id,
    title: s.title,
    blurb: s.blurb,
    expect: s.expect,
    status: 'idle',
  })),
  events: [],
  lights: null,
  espState: null,
  saturation: null,
  decisions: [],
  commands: [],
  running: null,
};

const clients = new Set();

function broadcast(type, payload) {
  const frame = `data: ${JSON.stringify({ type, payload })}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
}

function emit(event) {
  const entry = { at: new Date().toISOString(), ...event };
  state.events.push(entry);
  if (state.events.length > 600) state.events.shift();
  broadcast('event', entry);
  const tone =
    entry.tone === 'bad' ? '✗' : entry.tone === 'warn' ? '!' : entry.tone === 'step' ? '›' : '·';
  console.log(`  ${tone} ${entry.text}`);
}

// ─────────────────────────────────────────────────────────────────────
// stack boot
// ─────────────────────────────────────────────────────────────────────

async function ensureStack() {
  const mark = (key, up, note) => {
    state.stack[key] = { up, note };
    broadcast('stack', state.stack);
  };

  // 1. PGlite bridge
  if (await portOpen(PORTS.bridge)) {
    mark('bridge', true, 'already running');
  } else {
    console.log('· starting PGlite bridge …');
    launch('bridge', 'node', ['.pglite-bridge.mjs'], ROOT, 'bench-bridge.log');
    await waitForPort(PORTS.bridge, 'PGlite bridge', 60_000);
    mark('bridge', true, 'started by bench');
  }

  // 2. ESP32 simulator — own port so it never fights the viewer on 8080
  if (await portOpen(PORTS.esp)) {
    mark('esp', true, 'already running');
  } else {
    console.log('· starting ESP32 simulator …');
    launch('esp', 'npm', ['run', 'sim:esp'], BACKEND, 'bench-esp.log', {
      ESP_SIM_PORT: String(PORTS.esp),
    });
    await waitForPort(PORTS.esp, 'ESP32 simulator', 90_000);
    mark('esp', true, `virtual board on :${PORTS.esp}`);
  }

  // 3. Backend, pointed at the simulator
  if (await portOpen(PORTS.backend)) {
    mark('backend', true, 'already running (existing driver config)');
  } else {
    console.log('· starting backend (driver → virtual board) …');
    launch('backend', 'node', ['dist/main'], BACKEND, 'bench-backend.log', {
      CONTROLLER_DRIVER: 'esp',
      ESP_DRIVER_ENABLED: '1',
      ESP_BASE_URL: ESP,
    });
    await waitForPort(PORTS.backend, 'backend', 180_000);
    mark('backend', true, 'driver → virtual board');
  }

  // 4. Frontend (optional — the bench does not depend on it)
  if (WITH_FRONTEND) {
    if (await portOpen(PORTS.frontend)) {
      mark('frontend', true, 'already running');
    } else {
      console.log('· starting frontend …');
      launch('frontend', 'npm', ['run', 'dev'], path.join(ROOT, 'frontend'), 'bench-frontend.log');
      portOpen(PORTS.frontend).then(() => {});
      waitForPort(PORTS.frontend, 'frontend', 180_000)
        .then(() => mark('frontend', true, 'started by bench'))
        .catch(() => mark('frontend', false, 'failed to start'));
    }
  } else {
    mark('frontend', false, 'skipped (--no-frontend)');
  }

  mark('bench', true, `dashboard on :${PORTS.bench}`);
}

// ─────────────────────────────────────────────────────────────────────
// backend session
// ─────────────────────────────────────────────────────────────────────

let token = null;

async function login() {
  const res = await fetchJson(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CREDS),
  });
  if (!res.ok || !res.body?.accessToken) {
    throw new Error(`login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  token = res.body.accessToken;
}

const auth = () => ({ Authorization: `Bearer ${token}` });

// ─────────────────────────────────────────────────────────────────────
// database access (traffic injection)
// ─────────────────────────────────────────────────────────────────────

let db = null;

async function connectDb() {
  db = new Client(DB);
  await db.connect();
}

const branchCache = new Map();

async function branchesOf(code) {
  if (branchCache.has(code)) return branchCache.get(code);
  const { rows } = await db.query(
    `select c.id as "carrefourId", b.id as "branchId", b.direction
       from carrefours c
       join intersection_branches b on b."carrefourId" = c.id
      where c.code = $1 and b."isIncoming" = true
      order by b.direction`,
    [code],
  );
  if (rows.length === 0) throw new Error(`no incoming branches found for ${code}`);
  branchCache.set(code, rows);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────
// scenario context
// ─────────────────────────────────────────────────────────────────────

function makeContext() {
  return {
    step(title) {
      emit({ kind: 'step', tone: 'step', text: title });
    },

    note(text, tone = 'info') {
      emit({ kind: 'note', tone, text });
    },

    wait: sleep,

    async health() {
      const res = await fetchJson(`${API}/health`, {}, 8000);
      emit({
        kind: 'health',
        tone: res.ok ? 'ok' : 'bad',
        text: res.ok
          ? `Backend healthy (HTTP ${res.status}).`
          : `Backend UNHEALTHY (HTTP ${res.status}).`,
      });
      return res.ok;
    },

    /** Write traffic observations — this is what creates congestion. */
    async inject(code, branches) {
      const rows = await branchesOf(code);
      const byDirection = new Map(rows.map((r) => [r.direction, r]));
      const observedAt = new Date();
      let written = 0;

      for (const spec of branches) {
        const row = byDirection.get(spec.direction);
        if (!row) {
          emit({
            kind: 'inject',
            tone: 'warn',
            text: `No ${spec.direction} branch on ${code} — skipped.`,
          });
          continue;
        }
        await db.query(
          `insert into traffic_observations
             ("carrefourId","branchId","observedAt","flowVehiclesPerHour",
              "averageSpeedKph","queueLengthMetres","delaySeconds",
              "sourceType","confidence")
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            row.carrefourId,
            row.branchId,
            observedAt,
            spec.flowVph ?? null,
            spec.speedKph ?? null,
            spec.queueM ?? null,
            spec.delayS ?? null,
            'bench',
            0.95,
          ],
        );
        written += 1;
      }

      emit({
        kind: 'inject',
        tone: 'info',
        text:
          `Injected ${written} observation(s) on ${code}: ` +
          branches
            .map((b) => `${b.direction} ${b.flowVph ?? '?'} veh/h`)
            .join(', ') +
          '.',
      });
    },

    async clearObservations(code) {
      const rows = await branchesOf(code);
      const { rowCount } = await db.query(
        `delete from traffic_observations where "carrefourId" = $1`,
        [rows[0].carrefourId],
      );
      emit({
        kind: 'inject',
        tone: 'info',
        text: `Cleared ${rowCount} observation(s) on ${code}.`,
      });
    },

    /** Run the real optimiser and read saturation back. */
    async analyse(code) {
      const res = await fetchJson(
        `${API}/traffic-control/intersection/${code}/optimize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth() },
          body: '{}',
        },
        60_000,
      );
      if (!res.ok) {
        emit({
          kind: 'analysis',
          tone: 'bad',
          text: `Optimiser failed for ${code} (HTTP ${res.status}).`,
        });
        return null;
      }

      const data = res.body ?? {};
      const phases = Array.isArray(data.phases) ? data.phases : [];
      const approaches = phases.map((p) => ({
        direction: p.direction,
        saturation: Number(p.saturation ?? 0),
        inflowVph: p.inflowVph ?? null,
        capacityVph: p.capacityVph ?? null,
      }));
      const worst = approaches.reduce(
        (acc, cur) => (acc == null || cur.saturation > acc.saturation ? cur : acc),
        null,
      );

      state.saturation = {
        code,
        level: data.predictedCongestionLevel,
        action: data.recommendedAction,
        cycleSeconds: data.currentCycleSeconds,
        recommendedCycleSeconds: data.recommendedCycleSeconds,
        approaches,
        worst,
      };
      broadcast('saturation', state.saturation);

      emit({
        kind: 'analysis',
        tone:
          data.predictedCongestionLevel === 'congestion'
            ? 'bad'
            : data.predictedCongestionLevel === 'pressure'
              ? 'warn'
              : 'ok',
        text:
          `Analysis ${code}: level=${data.predictedCongestionLevel}, ` +
          `action=${data.recommendedAction}, worst ` +
          `${worst?.direction ?? '?'} X≈${worst?.saturation?.toFixed?.(2) ?? '?'}, ` +
          `cycle ${data.currentCycleSeconds}s → ${data.recommendedCycleSeconds}s.`,
      });

      return state.saturation;
    },

    /** Ask the real AI agents to run against the current state. */
    async runAgents(code) {
      const res = await fetchJson(
        `${API}/agents/intersection/${code}/run`,
        { headers: auth() },
        90_000,
      );
      if (!res.ok) {
        emit({
          kind: 'agents',
          tone: 'bad',
          text: `Agent run failed for ${code} (HTTP ${res.status}).`,
        });
        return null;
      }

      const outputs = Array.isArray(res.body?.outputs) ? res.body.outputs : [];
      const acted = outputs.filter((o) => o.decision != null);

      const decisions = acted.map((o) => ({
        agentId: o.agentId,
        kind: o.decision?.kind,
        severity: o.decision?.severity,
        rationale: Array.isArray(o.decision?.rationale) ? o.decision.rationale : [],
      }));
      state.decisions = decisions;
      broadcast('decisions', decisions);

      emit({
        kind: 'agents',
        tone: 'info',
        text:
          `${outputs.length} agent(s) ran on ${code}; ${acted.length} produced a decision ` +
          `(${acted.map((o) => `${o.agentId}→${o.decision?.kind}`).join(', ') || 'none'}).`,
      });

      for (const d of decisions) {
        emit({
          kind: 'decision',
          tone: d.severity === 'warning' ? 'warn' : d.severity === 'critical' ? 'bad' : 'ok',
          text: `AI [${d.agentId}] ${d.kind} — ${d.rationale[0] ?? 'no rationale'}`,
        });
      }
      return decisions;
    },

    async recentCommands() {
      const res = await fetchJson(
        `${API}/traffic-control/commands/recent?limit=10`,
        { headers: auth() },
        30_000,
      );
      const list = Array.isArray(res.body) ? res.body : (res.body?.data ?? []);
      state.commands = list.slice(0, 10).map((c) => ({
        id: c.id,
        kind: c.kind,
        status: c.status,
        scopeRef: c.intersectionCode ?? c.scopeRef,
        severity: c.severity,
      }));
      broadcast('commands', state.commands);
      emit({
        kind: 'commands',
        tone: 'info',
        text:
          list.length === 0
            ? 'No field commands queued (advisory-only outcome).'
            : `${list.length} recent command(s); latest: ${list[0]?.kind} → ${list[0]?.status}.`,
      });
      return state.commands;
    },

    /** Read the virtual board's lamps + state machine. */
    async espState() {
      const res = await fetchJson(`${ESP}/api/state`, {}, 8000).catch(() => null);
      if (!res?.ok) {
        emit({ kind: 'esp', tone: 'bad', text: 'Virtual board did not answer /api/state.' });
        return null;
      }
      state.espState = res.body.state;
      state.lights = res.body.lights;
      broadcast('board', { state: state.espState, lights: state.lights });
      emit({
        kind: 'esp',
        tone: 'info',
        text: `Board state: ${res.body.state} — ${describeLights(res.body.lights)}`,
      });
      return res.body;
    },

    /** Send a command straight to the board (or a dead endpoint). */
    async espCommand(body, opts = {}) {
      const target = opts.toDeadEndpoint ? DEAD_ESP : ESP;
      const started = Date.now();
      let res = null;
      let failure = null;
      try {
        res = await fetchJson(
          `${target}/api/command`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
          opts.toDeadEndpoint ? 4000 : 10_000,
        );
      } catch (err) {
        failure = err;
      }

      const ms = Date.now() - started;

      if (failure || !res) {
        emit({
          kind: 'hardware',
          tone: opts.toDeadEndpoint ? 'ok' : 'bad',
          text: opts.toDeadEndpoint
            ? `Dead endpoint refused/timed out after ${ms} ms — handled cleanly, no crash.`
            : `Board unreachable after ${ms} ms: ${failure?.message ?? 'unknown'}`,
        });
        return null;
      }

      const status = res.body?.status ?? `http_${res.status}`;
      const detail = res.body?.detail ?? '';
      const rejected = status === 'rejected';

      emit({
        kind: 'hardware',
        tone: opts.expectReject ? (rejected ? 'ok' : 'bad') : rejected ? 'warn' : 'ok',
        text:
          `Board ${body.kind} → ${status}` +
          (detail ? ` :: ${detail}` : '') +
          ` (${ms} ms)` +
          (opts.expectReject && rejected ? '  ← correctly refused' : '') +
          (opts.expectClamp && !rejected ? '  ← accepted, value clamped' : ''),
      });

      await this.espState();
      return res.body;
    },

    /** Operator action through the command platform. */
    async operator(code, action, body) {
      const res = await fetchJson(
        `${API}/command-platform/intersections/${code}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth() },
          body: JSON.stringify(body),
        },
        30_000,
      );
      emit({
        kind: 'operator',
        tone: res.ok ? 'ok' : 'bad',
        text: `Operator ${action} on ${code} → HTTP ${res.status}${
          res.ok ? '' : ` :: ${JSON.stringify(res.body).slice(0, 160)}`
        }`,
      });
      return res;
    },
  };
}

function describeLights(lights) {
  if (!lights) return 'no lamp data';
  const lamp = (dir) => {
    const d = lights[dir];
    if (!d) return `${dir}?`;
    if (d.green === 'ON') return `${dir}:GRN`;
    if (d.yellow === 'ON') return `${dir}:YEL`;
    if (d.red === 'ON') return `${dir}:RED`;
    return `${dir}:off`;
  };
  return ['N', 'S', 'E', 'W'].map(lamp).join('  ');
}

// ─────────────────────────────────────────────────────────────────────
// scenario runner
// ─────────────────────────────────────────────────────────────────────

let runLock = false;

async function runScenario(id) {
  if (runLock) return { ok: false, reason: 'a scenario is already running' };
  const scenario = scenarios.find((s) => s.id === id);
  if (!scenario) return { ok: false, reason: `unknown scenario "${id}"` };

  runLock = true;
  state.running = id;
  setScenarioStatus(id, 'running');
  broadcast('running', id);

  console.log(`\n▶ ${scenario.title}`);
  emit({ kind: 'scenario', tone: 'step', text: `▶ ${scenario.title}` });

  const started = Date.now();
  try {
    await scenario.run(makeContext());
    const ms = Date.now() - started;
    setScenarioStatus(id, 'done', ms);
    emit({ kind: 'scenario', tone: 'ok', text: `✔ ${scenario.title} — finished in ${ms} ms` });
    return { ok: true };
  } catch (err) {
    const ms = Date.now() - started;
    setScenarioStatus(id, 'failed', ms);
    emit({ kind: 'scenario', tone: 'bad', text: `✗ ${scenario.title} — ${err.message}` });
    return { ok: false, reason: err.message };
  } finally {
    runLock = false;
    state.running = null;
    broadcast('running', null);
  }
}

function setScenarioStatus(id, status, ms) {
  const entry = state.scenarios.find((s) => s.id === id);
  if (!entry) return;
  entry.status = status;
  if (ms != null) entry.durationMs = ms;
  broadcast('scenarios', state.scenarios);
}

async function runAll() {
  for (const s of scenarios) {
    await runScenario(s.id);
    await sleep(700);
  }
}

// ─────────────────────────────────────────────────────────────────────
// dashboard server
// ─────────────────────────────────────────────────────────────────────

function serve() {
  const uiPath = path.join(HERE, 'ui.html');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORTS.bench}`);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(uiPath));
      return;
    }

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify({ type: 'snapshot', payload: state })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (url.pathname === '/run' && req.method === 'POST') {
      const id = url.searchParams.get('id');
      const result = id === '__all__' ? (runAll(), { ok: true }) : await runScenario(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (url.pathname === '/board') {
      const board = await fetchJson(`${ESP}/api/state`, {}, 5000).catch(() => null);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(board?.body ?? {}));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORTS.bench, '127.0.0.1', () => resolve(server));
  });
}

/** Poll the board so the lamps animate even between scenarios. */
function startBoardPolling() {
  setInterval(async () => {
    const res = await fetchJson(`${ESP}/api/state`, {}, 3000).catch(() => null);
    if (!res?.ok) return;
    state.espState = res.body.state;
    state.lights = res.body.lights;
    broadcast('board', { state: state.espState, lights: state.lights });
  }, 1000);
}

// ─────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n· shutting down bench-started processes …');
  for (const { child } of children) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  try {
    await db?.end();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  console.log('─'.repeat(66));
  console.log(' STLS virtual bench');
  console.log('─'.repeat(66));

  await ensureStack();

  console.log('· connecting to database …');
  await connectDb();

  console.log('· signing in to the backend …');
  await login();

  PORTS.bench = await findFreePort(PORTS.bench);
  state.stack.bench = { up: true, note: `dashboard on :${PORTS.bench}` };
  await serve();
  startBoardPolling();

  console.log('─'.repeat(66));
  console.log(`  Dashboard   →  http://127.0.0.1:${PORTS.bench}`);
  console.log(`  Backend     →  ${API}`);
  console.log(`  Virtual board→ ${ESP}`);
  if (WITH_FRONTEND) console.log(`  App         →  http://127.0.0.1:${PORTS.frontend}`);
  console.log('─'.repeat(66));
  console.log('  Open the dashboard and press a scenario. Ctrl-C to stop.');
  console.log('─'.repeat(66));

  if (AUTO_RUN) await runAll();
}

main().catch((err) => {
  console.error('\nBench failed to start:', err.message);
  shutdown(1);
});
