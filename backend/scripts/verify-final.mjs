const BASE = process.env.STLS_BACKEND_URL ?? 'http://127.0.0.1:4010';
const tok = (await (await fetch(`${BASE}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@stls.local',password:'ChangeMe123!'})})).json()).accessToken;
const H={ 'Content-Type':'application/json', Authorization:`Bearer ${tok}` };
const j = async (m,p,b)=>{const r=await fetch(`${BASE}${p}`,{method:m,headers:H,body:b?JSON.stringify(b):undefined});return{s:r.status,ok:r.ok};};
const get = async p => (await fetch(`${BASE}${p}`,{headers:H})).json();

const ctrls = await get('/engineering/controllers');
const dakCtrl = ctrls.find(c=>c.code==='CTRL-DAKH-01');
const snap = await get('/command-platform/bootstrap');
const dakSnap = (snap.intersections??[]).find(i=>i.id==='CAR-DAKH-01'); // snapshot id === code
const dakHw = (snap.hardware??[]).find(h=>h.controllerId==='CTRL-DAKH-01');
console.log(`controllers total: ${ctrls.length}`);
console.log(`CTRL-DAKH-01 present: ${!!dakCtrl}`);
console.log(`CAR-DAKH-01 in command-platform snapshot: ${!!dakSnap}  (mode=${dakSnap?.mode})`);
console.log(`CTRL-DAKH-01 in snapshot hardware: ${!!dakHw}`);

// manipulation uses the CODE (snapshot id), not the UUID
const code = 'CAR-DAKH-01';
console.log(`\n--- manipulation on Dakhla ${code} ---`);
for (const [label,p,b] of [
  ['mode→manual',   `/command-platform/intersections/${code}/mode`, {mode:'manual',confirmed:true}],
  ['force-green N', `/command-platform/intersections/${code}/force-green`, {direction:'N'}],
  ['override on',   `/command-platform/intersections/${code}/override`, {engaged:true}],
  ['override off',  `/command-platform/intersections/${code}/override`, {engaged:false}],
  ['mode→adaptive', `/command-platform/intersections/${code}/mode`, {mode:'adaptive',confirmed:true}],
]) { const r=await j('POST',p,b); console.log(`  ${label}: HTTP ${r.s} ${r.ok?'OK':'FAIL'}`); }
