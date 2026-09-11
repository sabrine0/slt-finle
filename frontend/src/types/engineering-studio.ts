export interface EngineeringControllerRecord {
  id: string;
  code: string;
  firmwareVersion: string;
  controllerType?: string;
  runtimeVersion?: string;
  supportedPackageSchemaVersion?: number;
  connectionState: string;
  operatingEnvironment: string;
  batteryBacked: boolean;
  uptimeHours: number;
  detectorCapacity?: number;
  signalGroupCapacity?: number;
  isPrimary: boolean;
  lastSeen?: string | null;
  lastDeployedPackageVersion?: string | null;
  lastDeploymentState?: string | null;
  lastDeploymentAt?: string | null;
  lastTelemetryAt?: string | null;
  telemetrySummary?: Record<string, unknown>;
  lastKnownIpAddress?: string | null;
  intersectionId?: string;
  intersection?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface EngineeringDetectorRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  laneReference?: string | null;
  isActive: boolean;
  lastTriggeredAt?: string | null;
  controllerId?: string | null;
  assignedPhaseSequenceNumbers?: number[];
}

export interface EngineeringPhaseRecord {
  id: string;
  sequenceNumber: number;
  name: string;
  approach: string;
  movementGroup: string;
  phaseType: string;
  minGreenSeconds: number;
  yellowSeconds: number;
  redClearanceSeconds: number;
  pedestrianWalkSeconds?: number | null;
  pedestrianClearSeconds?: number | null;
  isProtected: boolean;
  clearanceGroup?: string | null;
  allowedConcurrentPhaseSequenceNumbers: number[];
  conflictingPhaseSequenceNumbers: number[];
}

export interface EngineeringScenarioRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  appliesTo: string;
}

export interface EngineeringTimingPlanRecord {
  id: string;
  code: string;
  name: string;
  status: string;
  cycleLengthSeconds: number;
  offsetSeconds: number;
  simulationOnly: boolean;
  scheduleConfig: Record<string, unknown>;
  planData: Record<string, unknown>;
  scenarioId?: string | null;
  scenario?: EngineeringScenarioRecord | null;
}

export interface EngineeringDeploymentRecord {
  id: string;
  status: string;
  targetType: string;
  targetEnvironment: string;
  operatingMode: string;
  packageVersion?: string | null;
  resultSummary?: string | null;
  isSigned: boolean;
  requestedAt: string;
  validatedAt?: string | null;
  signedAt?: string | null;
  publishedAt?: string | null;
  timingPlanId?: string | null;
  scenarioId?: string | null;
}

export interface EngineeringIntersectionRecord {
  id: string;
  code: string;
  name: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  controlMode: string;
  status: string;
  queueLength: number;
  incidents: number;
  averageDelaySeconds: number;
  lastHeartbeat?: string | null;
  controllers: EngineeringControllerRecord[];
  detectors: EngineeringDetectorRecord[];
  phases: EngineeringPhaseRecord[];
  timingPlans: EngineeringTimingPlanRecord[];
  deployments?: EngineeringDeploymentRecord[];
}

export interface EngineeringControllerCredentialRecord {
  id: string;
  clientId: string;
  label: string;
  issuedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
}

export interface EngineeringControllerRuntimeEventRecord {
  id: string;
  eventType: string;
  severity: string;
  summary: string;
  occurredAt: string;
  deploymentId?: string | null;
  deploymentPackageVersion?: string | null;
  payload: Record<string, unknown>;
}

export interface EngineeringControllerDetailRecord
  extends EngineeringControllerRecord {
  detectors: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    laneReference?: string | null;
    assignedPhaseSequenceNumbers: number[];
  }>;
  credentials: EngineeringControllerCredentialRecord[];
  recentRuntimeEvents: EngineeringControllerRuntimeEventRecord[];
}
