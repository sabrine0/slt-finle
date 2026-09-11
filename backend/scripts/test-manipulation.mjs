// Test the command-platform "manipulation" actions end-to-end.
const BASE = process.env.STLS_BACKEND_URL ?? 'http://127.0.0.1:4010';

async function login() {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@stls.local', password: 'ChangeMe123!' }),
  });
  return (await r.json()).accessToken;
}
const token = await login();
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data; try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: res.status, ok: res.ok, data };
}

// 1) snapshot — what the command platform UI loads
const snap = await call('GET', '/command-platform/bootstrap');
if (!snap.ok) { console.log('bootstrap FAILED', snap.status, snap.data); process.exit(1); }
const ix = snap.data.intersections ?? [];
const hw = snap.data.hardware ?? [];
console.log(`snapshot: ${ix.length} intersections, ${hw.length} controllers(hardware)`);
console.log('first intersection keys:', Object.keys(ix[0] ?? {}).join(', '));

// find Dakhla
const dak = ix.find((i) => JSON.stringify(i).includes('DAKH') || JSON.stringify(i).includes('Mohammed V'));
console.log('Dakhla in snapshot:', dak ? `${dak.code ?? dak.name} id=${dak.id} mode=${dak.mode ?? dak.controlMode}` : 'NOT FOUND');
const dakHw = hw.filter((h) => JSON.stringify(h).includes('DAKH'));
console.log('Dakhla controller in hardware:', dakHw.map((h) => h.code ?? h.id));

const target = dak ?? ix[0];
const id = target.id;
console.log(`\n--- manipulation on ${target.code ?? target.name} (${id}) ---`);

for (const [label, path, body] of [
  ['mode→manual', `/command-platform/intersections/${id}/mode`, { mode: 'manual', confirmed: true }],
  ['force-green N', `/command-platform/intersections/${id}/force-green`, { direction: 'N' }],
  ['override on', `/command-platform/intersections/${id}/override`, { engaged: true }],
  ['override off', `/command-platform/intersections/${id}/override`, { engaged: false }],
  ['mode→adaptive', `/command-platform/intersections/${id}/mode`, { mode: 'adaptive', confirmed: true }],
]) {
  const r = await call('POST', path, body);
  console.log(`  ${label}: HTTP ${r.status} ${r.ok ? 'OK' : 'FAIL'}` +
    (r.ok ? '' : `  → ${typeof r.data === 'string' ? r.data : JSON.stringify(r.data)}`));
}
