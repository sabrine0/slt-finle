export type CorridorScenarioCode =
  | "normal_traffic"
  | "peak_traffic"
  | "police_diversion"
  | "event_egress"
  | "emergency_clear_path";

export type CorridorControlKind =
  | "single_intersection"
  | "full_corridor"
  | "direction_priority"
  | "emergency_green_corridor";

export type CorridorControlStatus = "active" | "released" | "expired";

export type CorridorReasonCode =
  | "police_operation"
  | "emergency_vehicle"
  | "incident"
  | "event"
  | "congestion_relief"
  | "maintenance"
  | "drill"
  | "other";

export interface CorridorIntersectionSummary {
  id: string;
  orderIndex: number;
  intersectionCode: string;
  intersectionId: string | null;
  plannedOffsetSeconds: number;
  primaryBearing: "N" | "E" | "S" | "W" | null;
  name: string | null;
  controllerCode: string | null;
  controllerType: string | null;
  controllerConnectionState: string | null;
  city: string | null;
  district: string | null;
}

export interface CorridorSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  city: string | null;
  region: string | null;
  projectId: string | null;
  activeScenarioCode: CorridorScenarioCode;
  activeScenarioActivatedAt: string | null;
  activeScenarioActivatedByUserId: string | null;
  intersections: CorridorIntersectionSummary[];
  availableScenarioCodes: CorridorScenarioCode[];
  activeControlSessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CorridorIntersectionRuntimeView {
  orderIndex: number;
  intersectionCode: string;
  name: string | null;
  controllerCode: string | null;
  controllerType: string | null;
  controllerConnectionState: string | null;
  activePhaseId: string | null;
  activePhaseLabel: string;
  phaseState: string;
  secondsIntoPhaseState: number;
  secondsRemainingInPhaseState: number;
  cycleSecond: number;
  cycleSeconds: number;
  plannedOffsetSeconds: number;
  effectiveOffsetSeconds: number;
  modeOverride: string | null;
  manualOverride: boolean;
  forcedPhaseId: string | null;
  forcedDirection: string | null;
  signalGroups: Array<{ id: string; approachBearing: string; aspect: string }>;
  dispatchError: string | null;
  updatedAt: string;
}

export interface CorridorControlSessionView {
  id: string;
  corridorId: string;
  controlKind: CorridorControlKind;
  targetIntersectionCode: string | null;
  targetBearing: "N" | "E" | "S" | "W" | null;
  scenarioCode: CorridorScenarioCode | null;
  reasonCode: string;
  note: string | null;
  releaseNote: string | null;
  status: CorridorControlStatus;
  dispatchLog: Array<{
    intersectionCode: string;
    action: string;
    at: string;
    success: boolean;
    error?: string;
  }>;
  startedAt: string;
  expectedEndAt: string | null;
  releasedAt: string | null;
  durationSeconds: number | null;
  outranksAi: boolean;
  operatorUserId: string | null;
  releasedByUserId: string | null;
}

export interface CorridorRuntimeSnapshot {
  corridor: CorridorSummary;
  intersections: CorridorIntersectionRuntimeView[];
  activeSessions: CorridorControlSessionView[];
  recentSessions: CorridorControlSessionView[];
  coordinationHealth: "aligned" | "drifting" | "unknown";
  updatedAt: string;
}

export interface ActivateCorridorScenarioPayload {
  scenarioCode: CorridorScenarioCode;
  reasonCode: CorridorReasonCode;
  note?: string;
  durationSeconds?: number;
}

export interface CorridorOverridePayload {
  controlKind: CorridorControlKind;
  reasonCode: CorridorReasonCode;
  targetIntersectionCode?: string;
  targetBearing?: "N" | "E" | "S" | "W";
  note?: string;
  durationSeconds?: number;
}

export interface ReleaseCorridorControlPayload {
  sessionId?: string;
  note?: string;
}
