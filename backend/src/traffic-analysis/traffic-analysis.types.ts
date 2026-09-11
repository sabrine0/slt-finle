export type AnalysisHeuristicNote =
  | 'no_lane_capacity'
  | 'no_branch_geometry'
  | 'no_observation'
  | 'fallback_default'
  | 'spillback_risk_high';

export interface CapacityResult {
  carrefourId: string;
  perLane: Array<{
    branchId: string;
    laneId: string;
    laneIndex: number;
    direction: string;
    capacityVph: number;
    note?: AnalysisHeuristicNote;
  }>;
  perBranch: Array<{
    branchId: string;
    direction: string;
    capacityVph: number;
    laneCount: number;
    note?: AnalysisHeuristicNote;
  }>;
  totalCapacityVph: number;
  notes: AnalysisHeuristicNote[];
}

export interface SaturationResult {
  carrefourId: string;
  perBranch: Array<{
    branchId: string;
    direction: string;
    inflowVph: number;
    capacityVph: number;
    saturation: number;
    note?: AnalysisHeuristicNote;
  }>;
  overallSaturation: number;
  worstBranch: string | null;
  notes: AnalysisHeuristicNote[];
}

export interface QueueResult {
  carrefourId: string;
  perBranch: Array<{
    branchId: string;
    direction: string;
    queueLengthMetres: number;
    queueVehicles: number;
    note?: AnalysisHeuristicNote;
  }>;
  totalQueueMetres: number;
  notes: AnalysisHeuristicNote[];
}

export interface TravelTimeResult {
  fromCarrefourId: string;
  toCarrefourId: string;
  distanceMetres: number;
  freeFlowSeconds: number;
  estimatedSeconds: number;
  congestionFactor: number;
  notes: AnalysisHeuristicNote[];
}

export interface CriticalityResult {
  carrefourId: string;
  saturation: number;
  queueScore: number;
  spillbackScore: number;
  controllerScore: number;
  criticalityScore: number; // 0..1
  level: 'low' | 'moderate' | 'high' | 'critical';
  notes: AnalysisHeuristicNote[];
}
