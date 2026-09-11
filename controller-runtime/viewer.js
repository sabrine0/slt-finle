// Live traffic-light viewer for the STLS controller-runtime.
// Tails the controller log file, parses JSON events, and streams the current
// signal-group state to the browser via Server-Sent Events.
//
// Usage:  node viewer.js [logPath] [port]
// Default logPath: ./controller-wsl.log
// Default port:    8080

const http = require('http');
const fs   = require('fs');
const path = require('path');

const LOG_PATH = process.argv[2] || path.join(__dirname, 'controller-wsl.log');
const PORT     = parseInt(process.argv[3] || '8080', 10);

const STATE = {
  signals: { 'SG-001': 'unknown', 'SG-002': 'unknown', 'SG-003': 'unknown', 'SG-004': 'unknown' },
  stage:   '—',
  plan:    '—',
  runtimeState: 'INIT',
  lastEvent: null,
  cycles: 0,
};

const clients = new Set();

function broadcast() {
  const payload = `data: ${JSON.stringify(STATE)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (_) { /* dropped */ }
  }
}

function handleLogLine(line) {
  line = line.trim();
  if (!line) return;
  let evt;
  try { evt = JSON.parse(line); } catch { return; }

  STATE.lastEvent = evt.time || new Date().toISOString();

  if (evt.msg === 'signal state change' && evt.hal) {
    const g = evt.hal.group;
    const next = evt.hal.next;
    if (g && next) STATE.signals[g] = next;
  } else if (evt.msg === 'ALL-RED activated' && evt.hal && Array.isArray(evt.hal.groups)) {
    for (const g of evt.hal.groups) STATE.signals[g] = 'red';
    STATE.stage = 'ALL-RED (clearance)';
  } else if (evt.msg === 'stage start' && evt.phase) {
    STATE.stage = evt.phase.stage || STATE.stage;
  } else if (evt.msg === 'starting fixed cycle' && evt.phase) {
    STATE.plan = evt.phase.plan || STATE.plan;
    STATE.cycles += 1;
  } else if (evt.msg === 'state transition' && evt.state) {
    STATE.runtimeState = evt.state.to || STATE.runtimeState;
  } else {
    return;
  }
  broadcast();
}

// ── Tail the log file ────────────────────────────────────────────────────────
let lastSize = 0;
let buffer = '';

function readNew() {
  fs.stat(LOG_PATH, (err, st) => {
    if (err) return;
    if (st.size < lastSize) { lastSize = 0; buffer = ''; }
    if (st.size === lastSize) return;
    const stream = fs.createReadStream(LOG_PATH, { start: lastSize, end: st.size - 1 });
    stream.on('data', chunk => { buffer += chunk.toString('utf8'); });
    stream.on('end', () => {
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? '';
      for (const line of parts) handleLogLine(line);
      lastSize = st.size;
    });
  });
}
setInterval(readNew, 200);
readNew();

// ── HTTP server ──────────────────────────────────────────────────────────────
const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>STLS controller viewer</title>
<style>
  :root { color-scheme: dark; }
  body { background:#1c1c1c; color:#e6e6e6; font-family: system-ui, sans-serif; margin:24px; }
  h1 { font-size: 20px; margin:0 0 4px; }
  .meta { font-size: 13px; color:#999; margin-bottom: 20px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:4px; background:#333; margin-right:6px; }
  .grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:24px; max-width:900px; }
  .group { background:#262626; border-radius:10px; padding:18px; text-align:center; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
  .group h2 { font-size: 16px; margin: 0 0 12px; letter-spacing: 0.04em; }
  .lights { display:flex; flex-direction:column; align-items:center; gap:10px; padding:14px; background:#111; border-radius:8px; width:fit-content; margin:0 auto; }
  .lamp { width:64px; height:64px; border-radius:50%; background:#222; border:2px solid #333; transition: background 200ms, box-shadow 200ms; }
  .lamp.on.red    { background:#e63946; box-shadow: 0 0 24px #e63946aa; border-color:#e63946; }
  .lamp.on.yellow { background:#ffd60a; box-shadow: 0 0 24px #ffd60aaa; border-color:#ffd60a; }
  .lamp.on.green  { background:#34c759; box-shadow: 0 0 24px #34c759aa; border-color:#34c759; }
  .state { margin-top:10px; font-size:13px; color:#aaa; min-height:16px; }
  .footer { margin-top:24px; font-size:12px; color:#666; }
  .conn { display:inline-block; width:8px; height:8px; border-radius:50%; background:#666; margin-right:6px; }
  .conn.live { background:#34c759; }
</style></head><body>
<h1>STLS controller — live view</h1>
<div class="meta">
  <span class="badge"><span id="conn" class="conn"></span><span id="connText">connecting…</span></span>
  <span class="badge">runtime: <b id="runtimeState">—</b></span>
  <span class="badge">plan: <b id="plan">—</b></span>
  <span class="badge">stage: <b id="stage">—</b></span>
  <span class="badge">cycles: <b id="cycles">0</b></span>
  <span class="badge">last event: <b id="lastEvent">—</b></span>
</div>
<div class="grid" id="grid"></div>
<div class="footer">Tailing <code>${LOG_PATH.replace(/\\/g,'/')}</code> — refreshes automatically.</div>
<script>
  const groups = ['SG-001','SG-002','SG-003','SG-004'];
  const grid = document.getElementById('grid');
  for (const g of groups) {
    const el = document.createElement('div');
    el.className = 'group';
    el.innerHTML = '<h2>' + g + '</h2>'
      + '<div class="lights">'
      + '  <div class="lamp red"    data-g="'+g+'" data-c="red"></div>'
      + '  <div class="lamp yellow" data-g="'+g+'" data-c="yellow"></div>'
      + '  <div class="lamp green"  data-g="'+g+'" data-c="green"></div>'
      + '</div>'
      + '<div class="state" id="state-'+g+'">unknown</div>';
    grid.appendChild(el);
  }
  function render(state) {
    document.getElementById('runtimeState').textContent = state.runtimeState;
    document.getElementById('plan').textContent = state.plan;
    document.getElementById('stage').textContent = state.stage;
    document.getElementById('cycles').textContent = state.cycles;
    document.getElementById('lastEvent').textContent = state.lastEvent || '—';
    for (const g of groups) {
      const v = state.signals[g];
      document.getElementById('state-'+g).textContent = v;
      for (const c of ['red','yellow','green']) {
        const lamp = document.querySelector('[data-g="'+g+'"][data-c="'+c+'"]');
        lamp.classList.toggle('on', v === c);
      }
    }
  }
  const es = new EventSource('/events');
  es.onopen  = () => { document.getElementById('conn').classList.add('live'); document.getElementById('connText').textContent = 'live'; };
  es.onerror = () => { document.getElementById('conn').classList.remove('live'); document.getElementById('connText').textContent = 'reconnecting…'; };
  es.onmessage = e => { try { render(JSON.parse(e.data)); } catch {} };
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(STATE)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log(`viewer listening on http://localhost:${PORT}`);
  console.log(`tailing ${LOG_PATH}`);
});
