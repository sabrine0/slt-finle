export interface BackendCityView {
  id: string;
  regionId: string;
  name: string;
  nameAr: string;
  center: { lat: number; lng: number };
  defaultZoom: number;
  intersectionCount: number;
  controllerCount: number;
  incidentCount: number;
  averageDelaySeconds: number;
  tone: "healthy" | "watch" | "critical";
}

export interface BackendZoneView {
  id: string;
  cityId: string;
  regionId: string;
  name: string;
  nameAr: string;
  center: { lat: number; lng: number };
  intersectionCount: number;
  incidentCount: number;
  averageDelaySeconds: number;
  tone: "healthy" | "watch" | "critical";
}

export interface BackendRoadLinkView {
  id: string;
  fromIntersectionId: string;
  toIntersectionId: string;
  fromIntersectionCode: string;
  toIntersectionCode: string;
  fromCityId: string;
  toCityId: string;
  fromZoneId: string | null;
  toZoneId: string | null;
  relationKind: string;
  distanceMetres: number | null;
  travelTimeSeconds: number | null;
  queueSpillbackRisk: number | null;
  geometry: Record<string, unknown>;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}

export interface BackendScopePredictionHotspot {
  intersectionId: string;
  label: string;
  district: string;
  equipmentStatus: string;
  trafficState: "smooth" | "pressure" | "congestion";
  horizon: string;
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
}

export interface BackendScopePredictionSnapshot {
  id: string;
  scopeType: "city" | "zone";
  scopeRef: string;
  label: string;
  horizon: string;
  generatedAt: string;
  nodeCount: number;
  averageSaturation: number | null;
  totalQueueMetres: number | null;
  averageDelaySeconds: number | null;
  averageConfidence: number | null;
  congestionLevel: "smooth" | "pressure" | "congestion";
  hotspots: BackendScopePredictionHotspot[];
}
