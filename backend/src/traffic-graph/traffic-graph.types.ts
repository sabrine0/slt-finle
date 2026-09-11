import type {
  BranchDirection,
  ConnectedRelationKind,
  IntersectionRegulationType,
  MovementStatus,
} from '../database/entities';

export interface CitySummary {
  id: string;
  code: string;
  name: string;
  region: string | null;
  countryIso: string;
  centroid: { lat: number; lng: number } | null;
  carrefourCount: number;
}

export interface CarrefourSummary {
  id: string;
  code: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  engineeringIntersectionId: string | null;
  engineeringIntersectionCode: string | null;
  primaryControllerId: string | null;
  primaryControllerCode: string | null;
  primaryControllerType: string | null;
  primaryControllerConnectionState: string | null;
  lat: number;
  lng: number;
  intersectionType: string;
  regulationType: IntersectionRegulationType;
  saturationScore: number | null;
  criticalityScore: number | null;
  branchCount: number;
  movementCount: number;
  inboundLinks: number;
  outboundLinks: number;
}

export interface BranchView {
  id: string;
  carrefourId: string;
  direction: BranchDirection;
  label: string | null;
  isIncoming: boolean;
  isOutgoing: boolean;
  laneCount: number | null;
  widthMetres: number | null;
  lengthMetres: number | null;
  storageLengthMetres: number | null;
  branchClass: string | null;
  lanes: LaneView[];
}

export interface LaneView {
  id: string;
  laneIndex: number;
  widthMetres: number | null;
  allowedMovements: string[];
  reservedMode: string | null;
  hourlyCapacity: number | null;
}

export interface MovementView {
  id: string;
  carrefourId: string;
  fromDirection: BranchDirection;
  toDirection: BranchDirection;
  status: MovementStatus;
  protected: boolean;
  priorityLevel: number | null;
  hasConflict: boolean;
  conflictMovementIds: string[];
}

export interface ConnectedView {
  id: string;
  fromCarrefourId: string;
  toCarrefourId: string;
  relationKind: ConnectedRelationKind;
  distanceMetres: number | null;
  travelTimeSeconds: number | null;
  queueSpillbackRisk: number | null;
  geometry: Record<string, unknown>;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}
