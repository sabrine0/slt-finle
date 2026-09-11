export interface TrafficGraphCarrefourSummary {
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
  regulationType: string;
  saturationScore: number | null;
  criticalityScore: number | null;
  branchCount: number;
  movementCount: number;
  inboundLinks: number;
  outboundLinks: number;
}

export type TrafficGraphConnectedRelationKind =
  | "upstream"
  | "downstream"
  | "corridor"
  | "parallel";

export interface TrafficGraphConnectedView {
  id: string;
  fromCarrefourId: string;
  toCarrefourId: string;
  relationKind: TrafficGraphConnectedRelationKind;
  distanceMetres: number | null;
  travelTimeSeconds: number | null;
  queueSpillbackRisk: number | null;
  geometry: Record<string, unknown>;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}

export interface TrafficGraphCitySummary {
  id: string;
  code: string;
  name: string;
  region: string | null;
  countryIso: string;
  centroid: { lat: number; lng: number } | null;
  carrefourCount: number;
}

export interface TrafficGraphLaneView {
  id: string;
  laneIndex: number;
  widthMetres: number | null;
  allowedMovements: string[];
  reservedMode: string | null;
  hourlyCapacity: number | null;
}

export interface TrafficGraphBranchView {
  id: string;
  carrefourId: string;
  direction: string;
  label: string | null;
  isIncoming: boolean;
  isOutgoing: boolean;
  laneCount: number | null;
  widthMetres: number | null;
  lengthMetres: number | null;
  storageLengthMetres: number | null;
  branchClass: string | null;
  lanes: TrafficGraphLaneView[];
}

export interface TrafficGraphMovementView {
  id: string;
  carrefourId: string;
  fromDirection: string;
  toDirection: string;
  status: string;
  protected: boolean;
  priorityLevel: number | null;
  hasConflict: boolean;
  conflictMovementIds: string[];
}
