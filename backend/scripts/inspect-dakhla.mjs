const BASE = process.env.STLS_BACKEND_URL ?? 'http://127.0.0.1:4010';
const r = await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@stls.local', password: 'ChangeMe123!' }),
});
const { accessToken } = await r.json();
const H = { Authorization: `Bearer ${accessToken}` };
const get = async (p) => (await fetch(`${BASE}${p}`, { headers: H })).json();

const ix = (await get('/engineering/intersections')).filter((i) => i.code?.includes('DAKH'));
console.log('Intersections DAKH:', ix.map((i) => `${i.code} (${i.id})`));
const ctrls = (await get('/engineering/controllers')).filter((c) => c.code?.includes('DAKH'));
console.log('Controllers DAKH:', ctrls.map((c) => `${c.code} (${c.id})`));

for (const i of ix) {
  const phases = (await get('/engineering/phases')).filter((p) => p.intersectionId === i.id);
  console.log(`\nIntersection ${i.code} ${i.id}`);
  console.log('  phases:', phases.map((p) => `seq=${p.sequenceNumber} type=${p.phaseType} conf=[${p.conflictingPhaseSequenceNumbers}] id=${p.id}`));
  const dets = (await get('/engineering/detectors')).filter((d) => d.intersectionId === i.id);
  console.log('  detectors:', dets.map((d) => `${d.code}->ph[${d.assignedPhaseSequenceNumbers}]`));
  const tps = (await get('/engineering/timing-plans')).filter((t) => t.intersectionId === i.id);
  console.log('  timingPlans:', tps.map((t) => `${t.code} cyc=${t.cycleLengthSeconds} ${t.status}`));
  const deps = (await get('/engineering/deployments')).filter((d) => d.intersectionId === i.id);
  console.log('  deployments:', deps.map((d) => `${d.status} ${d.packageVersion ?? ''}`));
}
