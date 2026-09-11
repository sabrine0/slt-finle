import type {
  IntersectionMode,
  OperatorDirection,
} from '../traffic/traffic.types';

export type SignalAspect = 'red' | 'yellow' | 'green';
export type PhaseState = 'green' | 'yellow' | 'red-clearance' | 'idle';

export interface SignalGroupState {
  id: string;
  approachBearing: 'N' | 'E' | 'S' | 'W';
  aspect: SignalAspect;
}

export interface DetectorState {
  id: string;
  approachBearing: 'N' | 'E' | 'S' | 'W';
  active: boolean;
  lastActivationAt?: string;
}

export interface PhaseSlice {
  phaseId: string;
  label: string;
  greenSignalGroupIds: string[];
  minGreenSeconds: number;
  yellowSeconds: number;
  redClearanceSeconds: number;
  startsAtCycleSecond: number;
  durationSeconds: number;
}

export type ConfigBearing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface IntersectionConfigResponse {
  intersectionId: string;
  isDefault: boolean;
  signalGroups: Array<{
    id: string;
    approachBearing: ConfigBearing;
    label?: string;
  }>;
  detectors: Array<{
    id: string;
    approachBearing: ConfigBearing;
    label?: string;
  }>;
  phases: Array<{
    id: string;
    label: string;
    greenSignalGroupIds: string[];
    minGreenSeconds: number;
    yellowSeconds: number;
    redClearanceSeconds: number;
  }>;
  stages: Array<{
    id: string;
    phaseId: string;
    order: number;
  }>;
  conflicts: Array<{ a: string; b: string }>;
  cycleSeconds: number;
}

export interface IntersectionRuntimeState {
  intersectionId: string;
  activePhaseId: string | null;
  activePhaseLabel: string;
  phaseState: PhaseState;
  secondsIntoPhaseState: number;
  secondsRemainingInPhaseState: number;
  cycleSecond: number;
  cycleSeconds: number;
  orderedSlices: PhaseSlice[];
  signalGroups: SignalGroupState[];
  detectors: DetectorState[];
  commands: {
    manualOverride: boolean;
    forcedDirection: OperatorDirection | null;
    forcedPhaseId: string | null;
    modeOverride: IntersectionMode | null;
  };
  updatedAt: string;
}
