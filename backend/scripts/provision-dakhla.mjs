#!/usr/bin/env node
/**
 * provision-dakhla.mjs — create the Dakhla controller end-to-end against a
 * RUNNING STLS backend, via the /engineering API. Idempotent: existing items
 * (matched by code) are reused, not duplicated.
 *
 * Mirrors the seed design (CAR-DAKH-01 — Av. Mohammed V × Av. El Massira):
 *   intersection → controller → 4 phases → 8 detectors → 3 timing plans
 *   → deployment draft → validate → sign → publish.
 *
 * Usage:
 *   node scripts/provision-dakhla.mjs
 * Env (with defaults):
 *   STLS_BACKEND_URL=http://127.0.0.1:4010
 *   STLS_ADMIN_EMAIL=admin@stls.local
 *   STLS_ADMIN_PASSWORD=ChangeMe123!
 */

const BASE = process.env.STLS_BACKEND_URL ?? 'http://127.0.0.1:4010';
const EMAIL = process.env.STLS_ADMIN_EMAIL ?? 'admin@stls.local';
const PASSWORD = process.env.STLS_ADMIN_PASSWORD ?? 'ChangeMe123!';

let TOKEN = null;

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status} ${res.statusText}: ${
        typeof data === 'string' ? data : JSON.stringify(data)
      }`,
    );
  }
  return data;
}

/** Find an item by `code` in a list endpoint, or create it. */
async function ensure(label, listPath, createPath, code, payload) {
  const list = await api('GET', listPath);
  const found = Array.isArray(list)
    ? list.find((x) => x.code === code)
    : null;
  if (found) {
    console.log(`  = ${label} ${code} already exists (${found.id})`);
    return found;
  }
  const created = await api('POST', createPath, payload);
  console.log(`  + ${label} ${code} created (${created.id})`);
  return created;
}

async function main() {
  console.log(`STLS backend: ${BASE}`);
  const auth = await api('POST', '/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  TOKEN = auth.accessToken;
  console.log(`Authenticated as ${EMAIL}`);

  // 1) Intersection
  const intersection = await ensure(
    'intersection',
    '/engineering/intersections',
    '/engineering/intersections',
    'CAR-DAKH-01',
    {
      code: 'CAR-DAKH-01',
      name: 'Av. Mohammed V × Av. El Massira',
      district: 'Dakhla — Centre',
      address: 'Av. Mohammed V × Av. El Massira',
      latitude: 23.6848,
      longitude: -15.958,
      controlMode: 'adaptive',
    },
  );

  // 2) Controller
  const controller = await ensure(
    'controller',
    '/engineering/controllers',
    '/engineering/controllers',
    'CTRL-DAKH-01',
    {
      code: 'CTRL-DAKH-01',
      firmwareVersion: 'CeRyX 4.2',
      controllerType: 'atc',
      runtimeVersion: '4.2.1',
      connectionState: 'online',
      operatingEnvironment: 'real',
      batteryBacked: true,
      uptimeHours: 0,
      detectorCapacity: 32,
      signalGroupCapacity: 16,
      isPrimary: true,
      intersectionId: intersection.id,
    },
  );

  // 3) Phases (4-phase set with conflict matrices)
  const phases = [
    {
      sequenceNumber: 1, name: 'Main corridor', approach: 'north-south',
      movementGroup: 'through', phaseType: 'vehicle', minGreenSeconds: 28,
      yellowSeconds: 4, redClearanceSeconds: 2, pedestrianWalkSeconds: 12,
      pedestrianClearSeconds: 8, isProtected: true,
      conflictingPhaseSequenceNumbers: [2, 3, 4],
    },
    {
      sequenceNumber: 2, name: 'Opposing corridor', approach: 'east-west',
      movementGroup: 'through', phaseType: 'vehicle', minGreenSeconds: 24,
      yellowSeconds: 4, redClearanceSeconds: 2, pedestrianWalkSeconds: 10,
      pedestrianClearSeconds: 8, isProtected: true,
      conflictingPhaseSequenceNumbers: [1, 3, 4],
    },
    {
      sequenceNumber: 3, name: 'Turn pocket', approach: 'left-turn',
      movementGroup: 'left-turn', phaseType: 'vehicle', minGreenSeconds: 12,
      yellowSeconds: 3, redClearanceSeconds: 2, isProtected: true,
      conflictingPhaseSequenceNumbers: [1, 2, 4],
    },
    {
      sequenceNumber: 4, name: 'Pedestrian scramble', approach: 'pedestrian',
      movementGroup: 'pedestrian', phaseType: 'pedestrian', minGreenSeconds: 16,
      yellowSeconds: 3, redClearanceSeconds: 2, pedestrianWalkSeconds: 16,
      pedestrianClearSeconds: 10, isProtected: false,
      conflictingPhaseSequenceNumbers: [1, 2, 3],
    },
  ];
  // The safety validator rejects a phase that references conflicts not yet
  // present, so create every phase with empty conflicts first, then PATCH the
  // full conflict matrix once all four exist (asymmetry is only a warning).
  const existingPhases = await api('GET', '/engineering/phases');
  const bySeq = new Map(
    (existingPhases ?? [])
      .filter((p) => p.intersectionId === intersection.id)
      .map((p) => [p.sequenceNumber, p]),
  );
  const newlyCreated = [];
  for (const p of phases) {
    if (bySeq.has(p.sequenceNumber)) {
      console.log(`  = phase ${p.sequenceNumber} exists (left as-is)`);
      continue;
    }
    const { conflictingPhaseSequenceNumbers, ...base } = p;
    const created = await api('POST', '/engineering/phases', {
      ...base,
      clearanceGroup: `cg-${p.sequenceNumber}`,
      allowedConcurrentPhaseSequenceNumbers: [],
      conflictingPhaseSequenceNumbers: [],
      intersectionId: intersection.id,
    });
    bySeq.set(p.sequenceNumber, created);
    newlyCreated.push(p);
    console.log(`  + phase ${p.sequenceNumber} (${p.name})`);
  }
  // Only set conflicts on phases WE created (existing phases already carry a
  // valid matrix from the seed; re-patching mid-seed can race the validator).
  for (const p of newlyCreated) {
    const ph = bySeq.get(p.sequenceNumber);
    await api('PATCH', `/engineering/phases/${ph.id}`, {
      conflictingPhaseSequenceNumbers: p.conflictingPhaseSequenceNumbers,
    });
  }
  if (newlyCreated.length) console.log('  • conflict matrix applied');

  // 4) Detectors
  const detectors = [
    ['DET-DAKH-01-N', 'Northbound stop bar', 'loop', 'N1', [1]],
    ['DET-DAKH-01-S', 'Southbound stop bar', 'loop', 'S1', [1]],
    ['DET-DAKH-01-E', 'Eastbound stop bar', 'loop', 'E1', [2]],
    ['DET-DAKH-01-W', 'Westbound stop bar', 'loop', 'W1', [2]],
    ['DET-DAKH-01-LT', 'Protected left pocket', 'loop', 'LT-NS', [3]],
    ['DET-DAKH-01-CAM', 'Adaptive approach camera', 'camera', 'C1', [1, 2]],
    ['DET-DAKH-01-PED-N', 'Pedestrian button north', 'pedestrian_button', 'PED-N', [4]],
    ['DET-DAKH-01-PED-E', 'Pedestrian button east', 'pedestrian_button', 'PED-E', [4]],
  ];
  for (const [code, label, type, lane, ph] of detectors) {
    await ensure('detector', '/engineering/detectors',
      '/engineering/detectors', code, {
        code,
        name: `Av. Mohammed V × Av. El Massira — ${label}`,
        type,
        laneReference: lane,
        intersectionId: intersection.id,
        controllerId: controller.id,
        assignedPhaseSequenceNumbers: ph,
      });
  }

  // 5) Timing plans
  const plans = [
    ['TP-DAKH-01-PEAK', 'peak plan', 100, 'active'],
    ['TP-DAKH-01-OFFPEAK', 'off-peak plan', 70, 'active'],
    ['TP-DAKH-01-NIGHT', 'night plan', 60, 'active'],
  ];
  let peakPlan = null;
  for (const [code, label, cycle, status] of plans) {
    const plan = await ensure('timing-plan', '/engineering/timing-plans',
      '/engineering/timing-plans', code, {
        code,
        name: `Av. Mohammed V × Av. El Massira — ${label}`,
        status,
        cycleLengthSeconds: cycle,
        offsetSeconds: 0,
        simulationOnly: false,
        intersectionId: intersection.id,
      });
    if (code === 'TP-DAKH-01-PEAK') peakPlan = plan;
  }

  // 6) Deployment: draft → validate → sign → publish (skip if already published)
  console.log('Deployment chain:');
  const existingDeployments = await api('GET', '/engineering/deployments');
  const alreadyPublished = (existingDeployments ?? []).find(
    (d) => d.intersectionId === intersection.id && d.status === 'published',
  );
  if (alreadyPublished) {
    console.log(`  = published deployment already present (${alreadyPublished.id})`);
    console.log('\nDONE — Dakhla CAR-DAKH-01 already provisioned end-to-end.');
    return;
  }
  const draft = await api('POST', '/engineering/deployments/drafts', {
    targetType: 'timing_plan',
    targetEnvironment: 'real',
    operatingMode: 'adaptive',
    intersectionId: intersection.id,
    controllerId: controller.id,
    timingPlanId: peakPlan.id,
    requiredRuntimeVersion: '4.2.0',
    compatibleControllerTypes: ['atc'],
  });
  console.log(`  + draft ${draft.id} (status=${draft.status})`);
  const validated = await api('POST', `/engineering/deployments/${draft.id}/validate`);
  console.log(`  • validated (status=${validated.status})`);
  const signed = await api('POST', `/engineering/deployments/${draft.id}/sign`);
  console.log(`  • signed (status=${signed.status})`);
  const published = await api('POST', `/engineering/deployments/${draft.id}/publish`);
  console.log(`  • published (status=${published.status})`);

  console.log('\nDONE — Dakhla CAR-DAKH-01 provisioned end-to-end.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
