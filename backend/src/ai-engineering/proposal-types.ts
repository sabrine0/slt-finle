/**
 * Engineering proposal — produced by `ProposalGeneratorAdapter`,
 * consumed by `AiEngineeringService` for approval, and rendered by
 * the frontend AI étude workspace.
 *
 * Each proposal is a complete engineering draft : geometry +
 * signalisation + phasing + detection + capacity assessment + the
 * reasoning that justifies it. On approval the service materialises
 * a real STLS intersection from this data using the existing
 * EngineeringService.
 */

import type {
  ControllerType,
  DetectorType,
  PhaseType,
} from '../database/entities/enums';

export type ApproachBearing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export type IntersectionShape =
  | 'cruciform'
  | 't-junction'
  | 'y-junction'
  | 'mini-roundabout'
  | 'plaza';

export type ScopeKind = 'standard' | 'tram' | 'cablage';

export type SignalGroupKind =
  | 'vehicle'
  | 'pedestrian'
  | 'tram'
  | 'busway'
  | 'cyclist'
  | 'emergency';

export type Turning =
  | 'through'
  | 'left'
  | 'right'
  | 'through-right'
  | 'through-left';

export type ComplexityLevel = 'low' | 'medium' | 'high';

// ---------------------------------------------------------------
// Input
// ---------------------------------------------------------------

export interface ProposalGenerationInput {
  /** Human-friendly working name for the intersection. */
  name: string;
  /** Optional district / neighbourhood for the eventual address. */
  district?: string;
  /** Free-form address line — defaults to lat/lng when missing. */
  address?: string;
  /** WGS-84 coordinates (always required for now). */
  latitude: number;
  longitude: number;
  /** Engineering scope — drives which variants are surfaced. */
  scope: ScopeKind;
  /** Operator hint on the topology. Defaults to "cruciform". */
  shapeHint?: IntersectionShape;
  /** Operator-provided notes that any AI generator can read. */
  notes?: string;
}

// ---------------------------------------------------------------
// Proposal sub-shapes
// ---------------------------------------------------------------

export interface ProposalBranch {
  bearing: ApproachBearing;
  name: string;
  /** Number of incoming through+right lanes (excluding dedicated left). */
  laneCount: number;
  /** Set true to add a dedicated left-turn lane. */
  hasDedicatedLeft: boolean;
  /** Approach speed for clearance-time calc. */
  approachSpeedKph: number;
  /** Approximate chaussée width in meters (one direction). */
  laneWidthMeters: number;
}

export interface ProposalPedestrianCrossing {
  branchBearing: ApproachBearing;
  type: 'standard' | 'refuge';
  widthMeters: number;
  /** Width of the crossing perpendicular to walking direction (meters). */
  zebraWidthMeters: number;
}

export interface ProposalSignalGroup {
  code: string;
  label: string;
  approachBearing: ApproachBearing;
  kind: SignalGroupKind;
  turning?: Turning;
  /** Stable lane reference (e.g. "E1", "E2") for downstream mapping. */
  laneReference?: string;
}

export interface ProposalPhase {
  sequenceNumber: number;
  name: string;
  /** Type of phase (vehicle / pedestrian / transit) — drives PhaseType DTO. */
  phaseType: PhaseType;
  /** Approach descriptor for the engineering record (e.g. "E + W"). */
  approach: string;
  /** Movement group (e.g. "TD+D", "L", "PE"). */
  movementGroup: string;
  /** Whether this phase is fully protected (no permissive). */
  isProtected: boolean;
  minGreenSeconds: number;
  yellowSeconds: number;
  redClearanceSeconds: number;
  /** Pedestrian timings, only when phaseType=pedestrian. */
  pedestrianWalkSeconds?: number;
  pedestrianClearSeconds?: number;
  /** Codes of signal groups that go green during this phase. */
  greenSignalGroupCodes: string[];
  /** Sequence numbers of conflicting phases (cannot run concurrently). */
  conflictingPhaseSequenceNumbers: number[];
  /** Sequence numbers of phases that may run concurrently (overlaps). */
  allowedConcurrentPhaseSequenceNumbers: number[];
  notes?: string;
}

export interface ProposalDetector {
  code: string;
  label: string;
  kind: DetectorType;
  approachBearing: ApproachBearing;
  /** Distance upstream of stop bar in meters. */
  positionMetersFromStopLine: number;
  /** Optional lane reference to which this detector belongs. */
  laneReference?: string;
  /** Phase sequence numbers this detector services. */
  assignedPhaseSequenceNumbers: number[];
}

export interface ProposalTimingPlan {
  code: string;
  name: string;
  cycleSeconds: number;
  offsetSeconds: number;
  status: 'draft' | 'active';
  /** Optional notes (creneau / coordination plan). */
  notes?: string;
}

export interface ProposalConflict {
  fromSignalGroupCode: string;
  toSignalGroupCode: string;
  reason: string;
}

export interface ProposalCapacityEstimate {
  cycleSeconds: number;
  /** Saturation ratio at HPM (target ≤ 0.85). */
  saturationHPM: number;
  /** Approximate Webster average delay in seconds. */
  averageDelaySeconds: number;
  /** 95th percentile queue length in meters. */
  queueLength95thMeters: number;
  /** Reserve capacity (1 - saturationHPM), expressed as percent. */
  capacityReservePercent: number;
  notes?: string;
}

export interface ProposalReasoning {
  /** Operational + economic strengths. */
  advantages: string[];
  /** Operational risks + trade-offs. */
  disadvantages: string[];
  /** One-paragraph technical narrative on expected behaviour. */
  expectedBehavior: string;
  /** Why this variant was selected for this site (engineering rationale). */
  engineeringReasoning: string;
  /** Subjective rating of engineering & operational complexity. */
  estimatedComplexity: ComplexityLevel;
  /** 0-100 confidence on operational quality. */
  operationalQuality: number;
}

// ---------------------------------------------------------------
// Top-level proposal
// ---------------------------------------------------------------

export interface EngineeringProposal {
  id: string;
  variantCode: string;
  title: string;
  shortDescription: string;
  intersectionShape: IntersectionShape;
  scope: ScopeKind;
  recommendedControllerType: ControllerType;
  recommendedControlMode:
    | 'adaptive'
    | 'fixed'
    | 'manual'
    | 'fail-safe'
    | 'flash';
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
  /** Source of the proposal (audit). */
  source: string;
  /** ISO timestamp of generation. */
  generatedAt: string;
}

export interface ProposalSet {
  id: string;
  input: ProposalGenerationInput;
  proposals: EngineeringProposal[];
  generatedAt: string;
  /** Default 30 min from generation. */
  expiresAt: string;
  source: string;
}
