import type {
  ConnectionState,
  IntersectionHealth,
  LatLngPoint,
  TrafficFlowState,
} from "@/types/command-platform";
import type { TrafficGraphConnectedRelationKind } from "@/types/traffic-graph";
import type { EquipmentStatus } from "@/lib/command-platform-format";

export interface CommandNetworkNode {
  intersectionId: string;
  carrefourId: string | null;
  cityId: string | null;
  cityName: string | null;
  label: string;
  district: string;
  controllerId: string;
  controllerType: string | null;
  equipmentStatus: EquipmentStatus;
  connectionState: ConnectionState;
  location: LatLngPoint;
  status: IntersectionHealth;
  trafficState: TrafficFlowState;
  queueLength: number;
  averageDelaySeconds: number;
  incidents: number;
  saturationScore: number | null;
  criticalityScore: number | null;
}

export interface CommandNetworkLink {
  id: string;
  fromIntersectionId: string;
  toIntersectionId: string;
  relationKind: TrafficGraphConnectedRelationKind;
  distanceMetres: number | null;
  travelTimeSeconds: number | null;
  queueSpillbackRisk: number | null;
  state: TrafficFlowState;
}

export interface CommandNetworkPredictionSummary {
  intersectionId: string;
  label: string;
  district: string;
  equipmentStatus: EquipmentStatus;
  trafficState: TrafficFlowState;
  horizon: string;
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
}

export interface CommandPredictionHeatPoint {
  id: string;
  intersectionId: string;
  label: string;
  location: LatLngPoint;
  trafficState: TrafficFlowState;
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
  radiusMetres: number;
}

export interface CommandPredictionInsight {
  id: string;
  emoji: string;
  title: string;
  summary: string;
  detail: string;
  location: LatLngPoint;
  trafficState: TrafficFlowState;
}
