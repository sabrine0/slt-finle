/**
 * Browser-side client for the AI Engineering Assistant. Mirrors the
 * surface of the backend `ai-engineering` controller.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:4010";

export type ScopeKind = "standard" | "tram" | "cablage";

export type IntersectionShape =
  | "cruciform"
  | "t-junction"
  | "y-junction"
  | "mini-roundabout"
  | "plaza";

export type ApproachBearing =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW";

export type SignalGroupKind =
  | "vehicle"
  | "pedestrian"
  | "tram"
  | "busway"
  | "cyclist"
  | "emergency";

export type Turning =
  | "through"
  | "left"
  | "right"
  | "through-right"
  | "through-left";

export type ComplexityLevel = "low" | "medium" | "high";

export type ControllerTypeCode = "atc" | "nema_ts2" | "simulation_runtime";

export type PhaseTypeCode = "vehicle" | "pedestrian" | "transit";

export type DetectorTypeCode =
  | "loop"
  | "camera"
  | "radar"
  | "pedestrian_button";

export interface ProposalBranch {
  bearing: ApproachBearing;
  name: string;
  laneCount: number;
  hasDedicatedLeft: boolean;
  approachSpeedKph: number;
  laneWidthMeters: number;
}

export interface ProposalPedestrianCrossing {
  branchBearing: ApproachBearing;
  type: "standard" | "refuge";
  widthMeters: number;
  zebraWidthMeters: number;
}

export interface ProposalSignalGroup {
  code: string;
  label: string;
  approachBearing: ApproachBearing;
  kind: SignalGroupKind;
  turning?: Turning;
  laneReference?: string;
}

export interface ProposalPhase {
  sequenceNumber: number;
  name: string;
  phaseType: PhaseTypeCode;
  approach: string;
  movementGroup: string;
  isProtected: boolean;
  minGreenSeconds: number;
  yellowSeconds: number;
  redClearanceSeconds: number;
  pedestrianWalkSeconds?: number;
  pedestrianClearSeconds?: number;
  greenSignalGroupCodes: string[];
  conflictingPhaseSequenceNumbers: number[];
  allowedConcurrentPhaseSequenceNumbers: number[];
  notes?: string;
}

export interface ProposalDetector {
  code: string;
  label: string;
  kind: DetectorTypeCode;
  approachBearing: ApproachBearing;
  positionMetersFromStopLine: number;
  laneReference?: string;
  assignedPhaseSequenceNumbers: number[];
}

export interface ProposalTimingPlan {
  code: string;
  name: string;
  cycleSeconds: number;
  offsetSeconds: number;
  status: "draft" | "active";
  notes?: string;
}

export interface ProposalConflict {
  fromSignalGroupCode: string;
  toSignalGroupCode: string;
  reason: string;
}

export interface ProposalCapacityEstimate {
  cycleSeconds: number;
  saturationHPM: number;
  averageDelaySeconds: number;
  queueLength95thMeters: number;
  capacityReservePercent: number;
  notes?: string;
}

export interface ProposalReasoning {
  advantages: string[];
  disadvantages: string[];
  expectedBehavior: string;
  engineeringReasoning: string;
  estimatedComplexity: ComplexityLevel;
  operationalQuality: number;
}

export interface EngineeringProposal {
  id: string;
  variantCode: string;
  title: string;
  shortDescription: string;
  intersectionShape: IntersectionShape;
  scope: ScopeKind;
  recommendedControllerType: ControllerTypeCode;
  recommendedControlMode:
    | "adaptive"
    | "fixed"
    | "manual"
    | "fail-safe"
    | "flash";
  branches: ProposalBranch[];
  pedestrianCrossings: ProposalPedestrianCrossing[];
  signalGroups: ProposalSignalGroup[];
  phases: ProposalPhase[];
  detectors: ProposalDetector[];
  timingPlans: ProposalTimingPlan[];
  conflicts: ProposalConflict[];
  capacity: ProposalCapacityEstimate;
  reasoning: ProposalReasoning;
  warnings: string[];
  assumptions: string[];
  source: string;
  generatedAt: string;
}

export interface ProposalGenerationInput {
  name: string;
  district?: string;
  address?: string;
  latitude: number;
  longitude: number;
  scope: ScopeKind;
  shapeHint?: IntersectionShape;
  notes?: string;
}

export interface ProposalSet {
  id: string;
  input: ProposalGenerationInput;
  proposals: EngineeringProposal[];
  generatedAt: string;
  expiresAt: string;
  source: string;
  studyId?: string;
}

// ---------------------------------------------------------------
// Intersection Study (Phase 1.5)
// ---------------------------------------------------------------

export type IntersectionClassification =
  | "compact-crossroad"
  | "skewed-crossroad"
  | "boulevard-crossing"
  | "t-junction"
  | "y-junction"
  | "multi-leg-junction"
  | "tramway-intersection"
  | "pedestrian-heavy-node"
  | "corridor-node"
  | "offset-intersection"
  | "mini-roundabout"
  | "plaza";

export interface StudyConstraint {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  recommendedMitigation: string[];
}

export interface ConflictPoint {
  id: string;
  x: number;
  y: number;
  weight: number;
  label: string;
}

export interface DominantAxis {
  bearings: [ApproachBearing, ApproachBearing];
  reason: string;
}

export interface PedestrianExposure {
  score: number;
  level: "low" | "moderate" | "high" | "critical";
  drivers: string[];
}

export interface ObservedApproach {
  bearing: ApproachBearing;
  bearingDegrees: number;
  highwayClass: string;
  laneCount: number;
  widthMeters: number;
  oneWay: boolean;
  name?: string;
  speedKph?: number;
}

export interface ObservedGeometry {
  approaches: ObservedApproach[];
  pedestrianCrossings: unknown[];
  tramLines: unknown[];
  nearbyPoi: Array<{
    kind: string;
    name?: string;
    distanceMeters: number;
  }>;
  landUses?: Array<{
    kind:
      | "residential"
      | "commercial"
      | "industrial"
      | "retail"
      | "education"
      | "institutional"
      | "park"
      | "farmland"
      | "other";
    distanceMeters: number;
  }>;
  nearestSignalDistanceMeters?: number;
  hasRoundabout?: boolean;
  source: string;
}

export type MapContextKind =
  | "residential"
  | "commercial"
  | "industrial"
  | "mixed-urban"
  | "boulevard"
  | "rural"
  | "logistics-corridor"
  | "institutional"
  | "unknown";

export interface MapContext {
  kind: MapContextKind;
  label: string;
  drivers: string[];
  heavyVehicleScore: number;
  confidence: number;
}

export interface StudyConfidence {
  geometry: number;
  classification: number;
  pedestrianExposure: number;
  strategy: number;
}

export interface IntersectionStudy {
  id: string;
  name: string;
  scope: ScopeKind;
  latitude: number;
  longitude: number;
  observedGeometry: ObservedGeometry;
  classification: IntersectionClassification;
  classificationLabel: string;
  classificationReason: string;
  mapContext: MapContext;
  confidence: StudyConfidence;
  complexityScore: number;
  complexityBand: "low" | "moderate" | "high" | "critical";
  complexityDrivers: string[];
  dominantAxis: DominantAxis | null;
  pedestrianExposure: PedestrianExposure;
  estimatedConflictPoints: ConflictPoint[];
  totalConflictWeight: number;
  constraints: StudyConstraint[];
  recommendedVariantCodes: string[];
  generatedAt: string;
  expiresAt: string;
  source: string;
}

export interface AnalyzeStudyInput extends ProposalGenerationInput {
  geometry?: ObservedGeometry;
}

export interface ProposalApprovalInput {
  code: string;
  name?: string;
  district?: string;
  address?: string;
  controllerCode?: string;
}

export interface ProposalApprovalResult {
  intersectionId: string;
  intersectionCode: string;
  controllerCode: string;
  phaseCount: number;
  detectorCount: number;
  timingPlanCount: number;
  redirectTo: string;
  warnings: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as
        | { message?: string | string[] }
        | undefined;
      const msg = body?.message;
      if (Array.isArray(msg)) detail = msg.join("; ");
      else if (typeof msg === "string" && msg) detail = msg;
    } catch {
      /* not json */
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export function analyzeStudy(
  input: AnalyzeStudyInput,
): Promise<IntersectionStudy> {
  return request<IntersectionStudy>("/ai-engineering/study", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getStudy(studyId: string): Promise<IntersectionStudy> {
  return request<IntersectionStudy>(`/ai-engineering/study/${studyId}`);
}

export function generateProposals(
  input: ProposalGenerationInput & { studyId?: string },
): Promise<ProposalSet> {
  return request<ProposalSet>("/ai-engineering/proposals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getProposalSet(setId: string): Promise<ProposalSet> {
  return request<ProposalSet>(`/ai-engineering/proposals/${setId}`);
}

export function approveProposal(
  proposalId: string,
  input: ProposalApprovalInput,
): Promise<ProposalApprovalResult> {
  return request<ProposalApprovalResult>(
    `/ai-engineering/proposals/${proposalId}/approve`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
