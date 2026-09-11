import {
  AlarmSeverity,
  AlarmStatus,
  ControllerConnectionState,
  ControllerType,
  DeploymentStatus,
  DeploymentTargetType,
  DetectorType,
  IntersectionControlMode,
  IntersectionHealth,
  OperatingEnvironment,
  ScenarioTarget,
  TimingPlanStatus,
} from './entities';
import carfmapCarrefours from './seed-data-carfmap.json';

export const defaultUsers = [
  {
    email: 'admin@stls.local',
    fullName: 'System Admin',
    roles: ['admin'],
  },
  {
    email: 'operator@stls.local',
    fullName: 'Operations Operator',
    roles: ['operator'],
  },
  {
    email: 'engineer@stls.local',
    fullName: 'Traffic Engineer',
    roles: ['engineer'],
  },
  {
    email: 'police@stls.local',
    fullName: 'Police Command',
    roles: ['police'],
  },
  {
    email: 'maintenance@stls.local',
    fullName: 'Maintenance Desk',
    roles: ['maintenance'],
  },
] as const;

export const scenarioSeedData = [
  {
    code: 'normal_traffic',
    name: 'Normal traffic',
    description: 'Standard cycle plans with adaptive optimization enabled.',
    appliesTo: ScenarioTarget.SIMULATION,
    isSystem: true,
    isActive: false,
    parameters: {
      queueBias: -5,
      delayBias: -12,
      corridorBias: -10,
      throughputBase: 3210,
      activeControllers: 44,
    },
  },
  {
    code: 'peak_traffic',
    name: 'Peak traffic',
    description: 'Longer green waves on corridors with commuter pressure.',
    appliesTo: ScenarioTarget.SIMULATION,
    isSystem: true,
    isActive: true,
    parameters: {
      queueBias: 3,
      delayBias: 9,
      corridorBias: 8,
      throughputBase: 2840,
      activeControllers: 42,
    },
  },
  {
    code: 'emergency',
    name: 'Emergency',
    description: 'Manual priority override with police-first preemption.',
    appliesTo: ScenarioTarget.BOTH,
    isSystem: true,
    isActive: false,
    parameters: {
      queueBias: 7,
      delayBias: 18,
      corridorBias: 14,
      throughputBase: 2280,
      activeControllers: 38,
    },
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Real intersection inventory — sourced from Tomorrow Systems' Carrefours
// management app (https://carfmap.replit.app/api/carrefours).  The JSON
// dump lives next to this file so it can be re-pulled and re-imported
// when Tomorrow updates the master.
// ─────────────────────────────────────────────────────────────────────────

interface CarfmapCarrefour {
  id: number;
  name: string;
  lat: number;
  lng: number;
  status: string;
  city: string;
  notes: string;
  roadNorth: string;
  roadSouth: string;
  roadEast: string;
  roadWest: string;
  tags: string[];
}

const carfmapDataset = carfmapCarrefours as CarfmapCarrefour[];

function carrefourCode(entry: CarfmapCarrefour) {
  return `CAR-${String(entry.id).padStart(4, '0')}`;
}

function controllerCode(entry: CarfmapCarrefour) {
  return `CTRL-${String(entry.id).padStart(4, '0')}`;
}

function statusToHealth(status: string): IntersectionHealth {
  if (status === 'équipé hors service') return IntersectionHealth.CRITICAL;
  if (status === 'non régulé' || status === 'non spécifié')
    return IntersectionHealth.WATCH;
  return IntersectionHealth.HEALTHY;
}

function statusToControlMode(status: string): IntersectionControlMode {
  if (status === 'équipé hors service')
    return IntersectionControlMode.FAIL_SAFE;
  if (status === 'non régulé') return IntersectionControlMode.FIXED;
  return IntersectionControlMode.ADAPTIVE;
}

function statusToConnection(status: string): ControllerConnectionState {
  if (status === 'équipé hors service')
    return ControllerConnectionState.OFFLINE;
  if (status === 'non régulé' || status === 'non spécifié')
    return ControllerConnectionState.DEGRADED;
  return ControllerConnectionState.ONLINE;
}

function buildAddress(entry: CarfmapCarrefour) {
  const roads = [
    entry.roadNorth,
    entry.roadEast,
    entry.roadSouth,
    entry.roadWest,
  ]
    .map((value) => value?.trim())
    .filter((value) => value && value.length > 0);
  if (roads.length === 0) return entry.name;
  return roads.join(' × ');
}

function buildName(entry: CarfmapCarrefour) {
  const trimmed = entry.name?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  return `Carrefour ${entry.id}`;
}

function buildDistrict(entry: CarfmapCarrefour) {
  const trimmed = entry.city?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  return 'Maroc';
}

// Deterministic queue/delay seeding — keeps DB-level metrics realistic
// without baking in arbitrary numbers per-carrefour.  Uses the
// carrefour id as the seed so re-imports stay stable.
function seededInt(id: number, span: number, base: number) {
  const s = (id * 2654435761) >>> 0;
  return base + (s % span);
}

interface IntersectionSeedEntry {
  code: string;
  name: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  controlMode: IntersectionControlMode;
  status: IntersectionHealth;
  queueLength: number;
  incidents: number;
  averageDelaySeconds: number;
}

interface ControllerSeedEntry {
  code: string;
  intersectionCode: string;
  controllerType: ControllerType;
  firmwareVersion: string;
  runtimeVersion: string;
  connectionState: ControllerConnectionState;
  operatingEnvironment: OperatingEnvironment;
  batteryBacked: boolean;
  uptimeHours: number;
  detectorCapacity: number;
  signalGroupCapacity: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Benchmark engineering scenarios — real Moroccan intersections used as
// AI Engineering Assistant stress-test references. Seeded alongside the
// production carfmap dataset so engineers can compare AI proposals
// against a known curated baseline.
// ─────────────────────────────────────────────────────────────────────────
interface BenchmarkSeedEntry {
  code: string;
  controllerCode: string;
  name: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  controlMode: IntersectionControlMode;
  status: IntersectionHealth;
  queueLength: number;
  averageDelaySeconds: number;
}

const benchmarkSeedDataset: BenchmarkSeedEntry[] = [
  {
    code: 'CAR-9001',
    controllerCode: 'CTRL-9001',
    name: 'Av. Hay Andalous × Rue de Marrakech',
    district: 'Temara — Hay Andalous',
    address: 'Av. Hay Andalous × Rue de Marrakech',
    latitude: 33.9276,
    longitude: -6.9135,
    controlMode: IntersectionControlMode.FIXED,
    status: IntersectionHealth.HEALTHY,
    queueLength: 4,
    averageDelaySeconds: 18,
  },
  {
    code: 'CAR-9002',
    controllerCode: 'CTRL-9002',
    name: 'Av. Hassan II × Av. Mohamed VI',
    district: 'Temara — Centre',
    address: 'Av. Hassan II × Av. Mohamed VI',
    latitude: 33.9282,
    longitude: -6.9118,
    controlMode: IntersectionControlMode.ADAPTIVE,
    status: IntersectionHealth.HEALTHY,
    queueLength: 14,
    averageDelaySeconds: 32,
  },
  {
    code: 'CAR-9003',
    controllerCode: 'CTRL-9003',
    name: "Bd d'Anfa × Bd Zerktouni",
    district: 'Casablanca — Anfa',
    address: "Bd d'Anfa × Bd Zerktouni",
    latitude: 33.5876,
    longitude: -7.6332,
    controlMode: IntersectionControlMode.ADAPTIVE,
    status: IntersectionHealth.HEALTHY,
    queueLength: 22,
    averageDelaySeconds: 45,
  },
  {
    code: 'CAR-9004',
    controllerCode: 'CTRL-9004',
    name: 'Place Bab Rouah',
    district: 'Rabat — Hassan',
    address: 'Place Bab Rouah — Av. Ibn Sina × Av. Ennasr × Av. Allal Ben Abdellah',
    latitude: 34.0058,
    longitude: -6.84,
    controlMode: IntersectionControlMode.ADAPTIVE,
    status: IntersectionHealth.WATCH,
    queueLength: 28,
    averageDelaySeconds: 58,
  },
  {
    code: 'CAR-9005',
    controllerCode: 'CTRL-9005',
    name: 'Rond-point Sidi Maârouf',
    district: 'Casablanca — Sidi Maârouf',
    address: 'Rond-point Sidi Maârouf — Bd Sidi Maârouf × Autoroute A3',
    latitude: 33.531,
    longitude: -7.628,
    controlMode: IntersectionControlMode.ADAPTIVE,
    status: IntersectionHealth.WATCH,
    queueLength: 35,
    averageDelaySeconds: 65,
  },
  {
    code: 'CAR-9006',
    controllerCode: 'CTRL-9006',
    name: 'Bd Mers Sultan × Bd Hassan II (T1)',
    district: 'Casablanca — Mers Sultan',
    address: 'Bd Mers Sultan × Bd Hassan II — corridor tramway T1',
    latitude: 33.5849,
    longitude: -7.6112,
    controlMode: IntersectionControlMode.ADAPTIVE,
    status: IntersectionHealth.HEALTHY,
    queueLength: 18,
    averageDelaySeconds: 42,
  },
  {
    code: 'CAR-9007',
    controllerCode: 'CTRL-9007',
    name: 'Place Pietri (T2)',
    district: 'Rabat — Hassan',
    address: 'Place Pietri / Av. Mohammed V — corridor tramway T2',
    latitude: 34.0179,
    longitude: -6.8344,
    controlMode: IntersectionControlMode.ADAPTIVE,
    status: IntersectionHealth.HEALTHY,
    queueLength: 20,
    averageDelaySeconds: 48,
  },
  {
    code: 'CAR-9008',
    controllerCode: 'CTRL-9008',
    name: '★ Place des Nations Unies — flagship benchmark',
    district: 'Casablanca — Centre-ville',
    address:
      'Place des Nations Unies — Bd Mohammed V × Av. Hassan II × Av. des FAR × Bd Houphouët-Boigny (T1)',
    latitude: 33.5933,
    longitude: -7.6181,
    controlMode: IntersectionControlMode.ADAPTIVE,
    status: IntersectionHealth.WATCH,
    queueLength: 42,
    averageDelaySeconds: 78,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Dakhla — first signalized controller for the Dakhla-Oued Ed-Dahab region.
// No field étude exists yet, so this is a best-practice design: a 4-arm urban
// crossroads on the city's main artery, adaptive control with full detector
// coverage. Shares the standard system phase set; the engineering "best
// choice" lives in the adaptive mode, detector layout and the timing plans.
// ─────────────────────────────────────────────────────────────────────────
const dakhlaSeedDataset: BenchmarkSeedEntry[] = [
  {
    code: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    name: 'Av. Mohammed V × Av. El Massira',
    district: 'Dakhla — Centre',
    address: 'Av. Mohammed V × Av. El Massira',
    latitude: 23.6848,
    longitude: -15.958,
    controlMode: IntersectionControlMode.ADAPTIVE,
    status: IntersectionHealth.HEALTHY,
    queueLength: 8,
    averageDelaySeconds: 24,
  },
];

/** Codes of the curated Dakhla controllers seeded outside the carfmap import. */
export const dakhlaCarrefourCodes = dakhlaSeedDataset.map((d) => d.code);

export const intersectionSeedData: IntersectionSeedEntry[] = [
  ...carfmapDataset.map((entry) => ({
    code: carrefourCode(entry),
    name: buildName(entry),
    district: buildDistrict(entry),
    address: buildAddress(entry),
    latitude: entry.lat,
    longitude: entry.lng,
    controlMode: statusToControlMode(entry.status),
    status: statusToHealth(entry.status),
    queueLength: seededInt(entry.id, 30, 4),
    incidents:
      entry.status === 'équipé hors service'
        ? 1
        : entry.status === 'non régulé'
          ? 0
          : 0,
    averageDelaySeconds: seededInt(entry.id, 50, 18),
  })),
  ...[...benchmarkSeedDataset, ...dakhlaSeedDataset].map(
    (entry): IntersectionSeedEntry => ({
      code: entry.code,
      name: entry.name,
      district: entry.district,
      address: entry.address,
      latitude: entry.latitude,
      longitude: entry.longitude,
      controlMode: entry.controlMode,
      status: entry.status,
      queueLength: entry.queueLength,
      incidents: 0,
      averageDelaySeconds: entry.averageDelaySeconds,
    }),
  ),
];

export const controllerSeedData: ControllerSeedEntry[] = [
  ...carfmapDataset.map((entry) => ({
    code: controllerCode(entry),
    intersectionCode: carrefourCode(entry),
    controllerType: ControllerType.ATC,
    firmwareVersion: 'CeRyX 4.2',
    runtimeVersion: '4.2.1',
    connectionState: statusToConnection(entry.status),
    operatingEnvironment: OperatingEnvironment.REAL,
    batteryBacked: true,
    uptimeHours: seededInt(entry.id, 4000, 800),
    detectorCapacity: 24,
    signalGroupCapacity: 24,
  })),
  ...[...benchmarkSeedDataset, ...dakhlaSeedDataset].map(
    (entry, idx): ControllerSeedEntry => ({
      code: entry.controllerCode,
      intersectionCode: entry.code,
      controllerType: ControllerType.ATC,
      firmwareVersion: 'CeRyX 4.2',
      runtimeVersion: '4.2.1',
      connectionState: ControllerConnectionState.ONLINE,
      operatingEnvironment: OperatingEnvironment.REAL,
      batteryBacked: true,
      uptimeHours: 1200 + idx * 50,
      detectorCapacity: 32,
      signalGroupCapacity: 32,
    }),
  ),
];

/** Codes of the 8 AI Engineering Assistant benchmark scenarios. */
export const benchmarkCarrefourCodes = benchmarkSeedDataset.map((b) => b.code);

// Pin a few carrefours by id so the downstream seeds (detectors, timing
// plans, alarms, events, deployments) can reference real entries that
// definitely exist in the imported dataset.
function findByCarfmapId(id: number) {
  const entry = carfmapDataset.find((c) => c.id === id);
  if (!entry) {
    throw new Error(
      `seed-data: carfmap entry id=${id} missing from seed-data-carfmap.json`,
    );
  }
  return entry;
}

const REF_T3_ABBASSIDE = findByCarfmapId(147); // T3 — Bd MED 6 / Bd Abbasside
const REF_T4_RAHAL = findByCarfmapId(169); // T4 — Rahal Meskini / Abou bakr Essedik
const REF_BHNS_HARTI = findByCarfmapId(226); // BHNS / L5 — Mohammed VI / Cdt Driss Al Harti
const REF_FES_ROYAL = findByCarfmapId(126); // Fès — Royal Mirage
const REF_JADIDA_RTE1 = findByCarfmapId(114); // El Jadida — Rte 1 / Av Khalil Jabran

export const detectorSeedData = [
  {
    code: `DET-${REF_T3_ABBASSIDE.id}-N`,
    name: `${buildName(REF_T3_ABBASSIDE)} — Northbound stop bar`,
    type: DetectorType.LOOP,
    laneReference: 'N1',
    intersectionCode: carrefourCode(REF_T3_ABBASSIDE),
    controllerCode: controllerCode(REF_T3_ABBASSIDE),
    assignedPhaseSequenceNumbers: [1],
  },
  {
    code: `DET-${REF_T3_ABBASSIDE.id}-PED`,
    name: `${buildName(REF_T3_ABBASSIDE)} — Ped button east`,
    type: DetectorType.PEDESTRIAN_BUTTON,
    laneReference: 'PED-E',
    intersectionCode: carrefourCode(REF_T3_ABBASSIDE),
    controllerCode: controllerCode(REF_T3_ABBASSIDE),
    assignedPhaseSequenceNumbers: [4],
  },
  {
    code: `DET-${REF_T4_RAHAL.id}-EB`,
    name: `${buildName(REF_T4_RAHAL)} — Eastbound radar`,
    type: DetectorType.RADAR,
    laneReference: 'E1',
    intersectionCode: carrefourCode(REF_T4_RAHAL),
    controllerCode: controllerCode(REF_T4_RAHAL),
    assignedPhaseSequenceNumbers: [2, 3],
  },
  {
    code: `DET-${REF_BHNS_HARTI.id}-LD`,
    name: `${buildName(REF_BHNS_HARTI)} — Long-distance loop`,
    type: DetectorType.LOOP,
    laneReference: 'LD',
    intersectionCode: carrefourCode(REF_BHNS_HARTI),
    controllerCode: controllerCode(REF_BHNS_HARTI),
    assignedPhaseSequenceNumbers: [1, 2],
  },
  {
    code: `DET-${REF_FES_ROYAL.id}-CAM`,
    name: `${buildName(REF_FES_ROYAL)} — Approach camera`,
    type: DetectorType.CAMERA,
    laneReference: 'C1',
    intersectionCode: carrefourCode(REF_FES_ROYAL),
    controllerCode: controllerCode(REF_FES_ROYAL),
    assignedPhaseSequenceNumbers: [1],
  },
  // ── Dakhla CAR-DAKH-01 — full detector coverage (best practice) ──
  {
    code: 'DET-DAKH-01-N',
    name: 'Av. Mohammed V × Av. El Massira — Northbound stop bar',
    type: DetectorType.LOOP,
    laneReference: 'N1',
    intersectionCode: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    assignedPhaseSequenceNumbers: [1],
  },
  {
    code: 'DET-DAKH-01-S',
    name: 'Av. Mohammed V × Av. El Massira — Southbound stop bar',
    type: DetectorType.LOOP,
    laneReference: 'S1',
    intersectionCode: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    assignedPhaseSequenceNumbers: [1],
  },
  {
    code: 'DET-DAKH-01-E',
    name: 'Av. Mohammed V × Av. El Massira — Eastbound stop bar',
    type: DetectorType.LOOP,
    laneReference: 'E1',
    intersectionCode: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    assignedPhaseSequenceNumbers: [2],
  },
  {
    code: 'DET-DAKH-01-W',
    name: 'Av. Mohammed V × Av. El Massira — Westbound stop bar',
    type: DetectorType.LOOP,
    laneReference: 'W1',
    intersectionCode: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    assignedPhaseSequenceNumbers: [2],
  },
  {
    code: 'DET-DAKH-01-LT',
    name: 'Av. Mohammed V × Av. El Massira — Protected left pocket',
    type: DetectorType.LOOP,
    laneReference: 'LT-NS',
    intersectionCode: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    assignedPhaseSequenceNumbers: [3],
  },
  {
    code: 'DET-DAKH-01-CAM',
    name: 'Av. Mohammed V × Av. El Massira — Adaptive approach camera',
    type: DetectorType.CAMERA,
    laneReference: 'C1',
    intersectionCode: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    assignedPhaseSequenceNumbers: [1, 2],
  },
  {
    code: 'DET-DAKH-01-PED-N',
    name: 'Av. Mohammed V × Av. El Massira — Pedestrian button north',
    type: DetectorType.PEDESTRIAN_BUTTON,
    laneReference: 'PED-N',
    intersectionCode: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    assignedPhaseSequenceNumbers: [4],
  },
  {
    code: 'DET-DAKH-01-PED-E',
    name: 'Av. Mohammed V × Av. El Massira — Pedestrian button east',
    type: DetectorType.PEDESTRIAN_BUTTON,
    laneReference: 'PED-E',
    intersectionCode: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    assignedPhaseSequenceNumbers: [4],
  },
] as const;

export const phaseTemplates = [
  {
    sequenceNumber: 1,
    name: 'Main corridor',
    movementGroup: 'through',
    minGreenSeconds: 28,
    yellowSeconds: 4,
    redClearanceSeconds: 2,
    pedestrianWalkSeconds: 12,
    pedestrianClearSeconds: 8,
    isProtected: true,
  },
  {
    sequenceNumber: 2,
    name: 'Opposing corridor',
    movementGroup: 'through',
    minGreenSeconds: 24,
    yellowSeconds: 4,
    redClearanceSeconds: 2,
    pedestrianWalkSeconds: 10,
    pedestrianClearSeconds: 8,
    isProtected: true,
  },
  {
    sequenceNumber: 3,
    name: 'Turn pocket',
    movementGroup: 'left-turn',
    minGreenSeconds: 12,
    yellowSeconds: 3,
    redClearanceSeconds: 2,
    pedestrianWalkSeconds: null,
    pedestrianClearSeconds: null,
    isProtected: true,
  },
  {
    sequenceNumber: 4,
    name: 'Pedestrian scramble',
    movementGroup: 'pedestrian',
    minGreenSeconds: 16,
    yellowSeconds: 3,
    redClearanceSeconds: 2,
    pedestrianWalkSeconds: 16,
    pedestrianClearSeconds: 10,
    isProtected: false,
  },
] as const;

export const timingPlanSeedData = [
  {
    code: `TP-${REF_T3_ABBASSIDE.id}-PEAK`,
    name: `${buildName(REF_T3_ABBASSIDE)} — peak plan`,
    status: TimingPlanStatus.ACTIVE,
    cycleLengthSeconds: 90,
    offsetSeconds: 0,
    simulationOnly: false,
    intersectionCode: carrefourCode(REF_T3_ABBASSIDE),
    scenarioCode: 'peak_traffic',
  },
  {
    code: `TP-${REF_T4_RAHAL.id}-PEAK`,
    name: `${buildName(REF_T4_RAHAL)} — peak plan`,
    status: TimingPlanStatus.ACTIVE,
    cycleLengthSeconds: 80,
    offsetSeconds: 6,
    simulationOnly: false,
    intersectionCode: carrefourCode(REF_T4_RAHAL),
    scenarioCode: 'peak_traffic',
  },
  {
    code: `TP-${REF_BHNS_HARTI.id}-PEAK`,
    name: `${buildName(REF_BHNS_HARTI)} — BHNS L5 plan`,
    status: TimingPlanStatus.ACTIVE,
    cycleLengthSeconds: 100,
    offsetSeconds: 12,
    simulationOnly: false,
    intersectionCode: carrefourCode(REF_BHNS_HARTI),
    scenarioCode: 'peak_traffic',
  },
  {
    code: `TP-${REF_FES_ROYAL.id}-NORMAL`,
    name: `${buildName(REF_FES_ROYAL)} — daily plan`,
    status: TimingPlanStatus.ACTIVE,
    cycleLengthSeconds: 70,
    offsetSeconds: 0,
    simulationOnly: false,
    intersectionCode: carrefourCode(REF_FES_ROYAL),
    scenarioCode: 'normal_traffic',
  },
  {
    code: `TP-${REF_JADIDA_RTE1.id}-NORMAL`,
    name: `${buildName(REF_JADIDA_RTE1)} — daily plan`,
    status: TimingPlanStatus.ACTIVE,
    cycleLengthSeconds: 75,
    offsetSeconds: 0,
    simulationOnly: false,
    intersectionCode: carrefourCode(REF_JADIDA_RTE1),
    scenarioCode: 'normal_traffic',
  },
  // ── Dakhla CAR-DAKH-01 — time-of-day plan set (peak / off-peak / night) ──
  {
    code: 'TP-DAKH-01-PEAK',
    name: 'Av. Mohammed V × Av. El Massira — peak plan',
    status: TimingPlanStatus.ACTIVE,
    cycleLengthSeconds: 100,
    offsetSeconds: 0,
    simulationOnly: false,
    intersectionCode: 'CAR-DAKH-01',
    scenarioCode: 'peak_traffic',
  },
  {
    code: 'TP-DAKH-01-OFFPEAK',
    name: 'Av. Mohammed V × Av. El Massira — off-peak plan',
    status: TimingPlanStatus.ACTIVE,
    cycleLengthSeconds: 70,
    offsetSeconds: 0,
    simulationOnly: false,
    intersectionCode: 'CAR-DAKH-01',
    scenarioCode: 'normal_traffic',
  },
  {
    code: 'TP-DAKH-01-NIGHT',
    name: 'Av. Mohammed V × Av. El Massira — night plan',
    status: TimingPlanStatus.ACTIVE,
    cycleLengthSeconds: 60,
    offsetSeconds: 0,
    simulationOnly: false,
    intersectionCode: 'CAR-DAKH-01',
    scenarioCode: 'normal_traffic',
  },
] as const;

export const alarmSeedData = [
  {
    severity: AlarmSeverity.WARNING,
    status: AlarmStatus.OPEN,
    operatingEnvironment: OperatingEnvironment.REAL,
    title: 'Pression cycle T3 — pointe matin',
    detail: `Réserve de capacité réduite sur ${buildName(REF_T3_ABBASSIDE)}.`,
    intersectionCode: carrefourCode(REF_T3_ABBASSIDE),
    controllerCode: controllerCode(REF_T3_ABBASSIDE),
  },
  {
    severity: AlarmSeverity.INFO,
    status: AlarmStatus.OPEN,
    operatingEnvironment: OperatingEnvironment.REAL,
    title: 'Priorité bus BHNS L5 active',
    detail: `Fenêtres de priorité actives sur ${buildName(REF_BHNS_HARTI)}.`,
    intersectionCode: carrefourCode(REF_BHNS_HARTI),
    controllerCode: controllerCode(REF_BHNS_HARTI),
  },
] as const;

export const eventSeedData = [
  {
    eventType: 'scenario.activated',
    operatingEnvironment: OperatingEnvironment.REAL,
    summary: 'Plan de feux peak activé sur la ligne T3.',
    payload: { scenarioCode: 'peak_traffic' },
    intersectionCode: carrefourCode(REF_T3_ABBASSIDE),
    controllerCode: controllerCode(REF_T3_ABBASSIDE),
    scenarioCode: 'peak_traffic',
  },
  {
    eventType: 'controller.heartbeat',
    operatingEnvironment: OperatingEnvironment.REAL,
    summary: 'Controllers réseau Tomorrow — heartbeat healthy.',
    payload: { healthyControllers: carfmapDataset.length },
    intersectionCode: carrefourCode(REF_FES_ROYAL),
    controllerCode: controllerCode(REF_FES_ROYAL),
    scenarioCode: null,
  },
] as const;

export const deploymentSeedData: Array<{
  status: DeploymentStatus;
  targetType: DeploymentTargetType;
  targetEnvironment: OperatingEnvironment;
  payload: { version: string; signedBy: string };
  resultSummary: string;
  isSigned: boolean;
  requiredRuntimeVersion: string;
  compatibleControllerTypes: ControllerType[];
  runtimeContractSchemaVersion: number;
  intersectionCode: string;
  controllerCode: string;
  timingPlanCode: string;
  scenarioCode: string;
}> = [
  {
    status: DeploymentStatus.PUBLISHED,
    targetType: DeploymentTargetType.TIMING_PLAN,
    targetEnvironment: OperatingEnvironment.REAL,
    payload: {
      version: '2026.04.27-peak',
      signedBy: 'system-bootstrap',
    },
    resultSummary: `Plan peak déployé sur ${buildName(REF_T3_ABBASSIDE)}.`,
    isSigned: true,
    requiredRuntimeVersion: '4.2.0',
    compatibleControllerTypes: [ControllerType.ATC],
    runtimeContractSchemaVersion: 1,
    intersectionCode: carrefourCode(REF_T3_ABBASSIDE),
    controllerCode: controllerCode(REF_T3_ABBASSIDE),
    timingPlanCode: `TP-${REF_T3_ABBASSIDE.id}-PEAK`,
    scenarioCode: 'peak_traffic',
  },
  {
    status: DeploymentStatus.PUBLISHED,
    targetType: DeploymentTargetType.TIMING_PLAN,
    targetEnvironment: OperatingEnvironment.REAL,
    payload: {
      version: '2026.05.21-dakhla-peak',
      signedBy: 'system-bootstrap',
    },
    resultSummary:
      'Plan peak déployé sur Av. Mohammed V × Av. El Massira (Dakhla).',
    isSigned: true,
    requiredRuntimeVersion: '4.2.0',
    compatibleControllerTypes: [ControllerType.ATC],
    runtimeContractSchemaVersion: 1,
    intersectionCode: 'CAR-DAKH-01',
    controllerCode: 'CTRL-DAKH-01',
    timingPlanCode: 'TP-DAKH-01-PEAK',
    scenarioCode: 'peak_traffic',
  },
];

// Convenience exports — picked carrefour codes that the corridor
// builder, runtime defaults and frontend fallback share.  Keeping them
// here means a single edit re-targets every cross-reference.
export const featuredCarrefourCodes = {
  t3Abbasside: carrefourCode(REF_T3_ABBASSIDE),
  t4Rahal: carrefourCode(REF_T4_RAHAL),
  bhnsHarti: carrefourCode(REF_BHNS_HARTI),
  fesRoyal: carrefourCode(REF_FES_ROYAL),
  jadidaRte1: carrefourCode(REF_JADIDA_RTE1),
} as const;

export const carfmapTagIndex = (() => {
  const tagToCodes = new Map<string, string[]>();
  for (const entry of carfmapDataset) {
    for (const tag of entry.tags ?? []) {
      const list = tagToCodes.get(tag) ?? [];
      list.push(carrefourCode(entry));
      tagToCodes.set(tag, list);
    }
  }
  return tagToCodes;
})();
