import type {
  ConnectionState,
  IntersectionHealth,
  IntersectionMode,
  IntersectionSnapshot,
  LatLngPoint,
  TrafficFlowState,
} from "@/types/command-platform";

export type GeographyLevel =
  | "country"
  | "region"
  | "city"
  | "district"
  | "intersection";

export interface SelectionPath {
  level: GeographyLevel;
  regionId?: string;
  cityId?: string;
  districtId?: string;
  intersectionId?: string;
}

export interface BreadcrumbCrumb {
  level: GeographyLevel;
  label: string;
  labelAr?: string;
  selection: SelectionPath;
}

export interface SelectedAreaSummary {
  level: GeographyLevel;
  typeLabel: string;
  name: string;
  nameAr?: string;
  intersectionCount: number;
  congestionMix: Record<TrafficFlowState, number>;
  dominantCongestion: TrafficFlowState | null;
  incidentCount: number;
  controllerMix: Record<ConnectionState, number>;
  dominantMode: IntersectionMode | null;
  statusMix: Record<IntersectionHealth, number>;
  intersection?: IntersectionSnapshot;
  center: LatLngPoint;
  averageDelaySeconds?: number;
  totalQueue?: number;
  worstDistrictId?: string;
}

export interface DistrictChipInfo {
  id: string;
  name: string;
  nameAr: string;
  intersectionCount: number;
  incidentCount: number;
  worstStatus: IntersectionHealth;
  averageDelaySeconds: number;
}

export interface RegionMarker {
  id: string;
  name: string;
  nameAr: string;
  center: LatLngPoint;
  intersectionCount: number;
  tone: IntersectionHealth;
}

export interface RegionPolygon {
  id: string;
  name: string;
  nameAr: string;
  paths: LatLngPoint[];
  center: LatLngPoint;
  tone: IntersectionHealth;
  intersectionCount: number;
  incidentCount: number;
  isWorst: boolean;
}

export interface CityMarker {
  id: string;
  regionId: string;
  name: string;
  nameAr: string;
  center: LatLngPoint;
  intersectionCount: number;
  tone: IntersectionHealth;
}

export interface MapView {
  mode: "country" | "region" | "city";
  center: LatLngPoint;
  zoom: number;
  regionMarkers?: RegionMarker[];
  cityMarkers?: CityMarker[];
  regionPolygons?: RegionPolygon[];
  focusRegionId?: string;
}
