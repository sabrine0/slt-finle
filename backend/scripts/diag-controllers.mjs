const BASE = process.env.STLS_BACKEND_URL ?? 'http://127.0.0.1:4010';
const tok = (await (await fetch(`${BASE}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email:'admin@stls.local',password:'ChangeMe123!'})})).json()).accessToken;
const H = { Authorization:`Bearer ${tok}` };
const get = async (p) => (await fetch(`${BASE}${p}`, { headers:H })).json();

const ix = await get('/engineering/intersections');
const ctrls = await get('/engineering/controllers');
const snap = await get('/command-platform/bootstrap');

console.log('engineering/intersections:', ix.length);
console.log('engineering/controllers:  ', ctrls.length);
const withIx = ctrls.filter(c => c.intersectionId).length;
console.log('  controllers WITH intersectionId:', withIx, ' WITHOUT:', ctrls.length - withIx);
console.log('command-platform intersections:', (snap.intersections??[]).length);
console.log('command-platform hardware(controllers):', (snap.hardware??[]).length);
console.log('  hardware entries:', (snap.hardware??[]).map(h=>`${h.controllerId}@${h.intersectionId}`).slice(0,10));

// is CAR-DAKH-01 present where?
const dakIxEng = ix.find(i=>i.code==='CAR-DAKH-01');
const dakIxSnap = (snap.intersections??[]).find(i=>i.code==='CAR-DAKH-01');
console.log('\nCAR-DAKH-01 in engineering:', !!dakIxEng, ' in snapshot:', !!dakIxSnap);

// distinct intersectionIds among controllers vs intersections
const ctrlIxIds = new Set(ctrls.map(c=>c.intersectionId).filter(Boolean));
console.log('distinct intersections that have >=1 controller:', ctrlIxIds.size, 'of', ix.length, 'intersections');
