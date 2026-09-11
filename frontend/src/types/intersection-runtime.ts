import type {
  IntersectionMode,
  OperatorDirection,
} from "@/types/command-platform";

export type SignalAspect = "red" | "yellow" | "green";
export type PhaseState = "green" | "yellow" | "red-clearance" | "idle";
export type Bearing = "N" | "E" | "S" | "W";

export interface SignalGroupState {
  id: string;
  approachBearing: Bearing;
  aspect: SignalAspect;
}

export interface DetectorState {
  id: string;
  approachBearing: Bearing;
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
