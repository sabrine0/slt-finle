export type TrafficFlowState = 'smooth' | 'pressure' | 'congestion';
export type IntersectionMode =
  | 'adaptive'
  | 'manual'
  | 'fixed'
  | 'emergency'
  | 'flash'
  | 'fail-safe';
export type IntersectionHealth = 'healthy' | 'watch' | 'critical';
export type ConnectionState = 'online' | 'degraded' | 'offline';
export type SystemMode = 'real' | 'simulation';
export type ScenarioId = 'normal_traffic' | 'peak_traffic' | 'emergency';
export type SystemState = 'running' | 'stopped';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface CommandMetrics {
  throughputVph: number;
  delayIndex: number;
  activeControllers: number;
  incidentsCount: number;
  updatedAt: string;
  activeScenario: ScenarioId;
  city: string;
}

export type OperatorDirection = 'N' | 'E' | 'S' | 'W';

export interface IntersectionSnapshot {
  id: string;
  name: string;
  regionId?: string;
  cityId?: string;
  zoneId?: string | null;
  district: string;
  address: string;
  location: LatLngPoint;
  mode: IntersectionMode;
  status: IntersectionHealth;
  queueLength: number;
  incidents: number;
  averageDelaySeconds: number;
  controllerId: string;
  controllerConnectionState: ConnectionState;
  systemMode: SystemMode;
  lastHeartbeat: string;
  manualOverride?: boolean;
  forcedDirection?: OperatorDirection | null;
}

export interface CorridorSnapshot {
  id: string;
  label: string;
  state: TrafficFlowState;
  volumeKph: number;
  travelTimeMinutes: number;
  path: LatLngPoint[];
}

export interface HardwareSnapshot {
  controllerId: string;
  intersectionId: string;
  connectionState: ConnectionState;
  mode: SystemMode;
  firmwareVersion: string;
  uptimeHours: number;
  batteryBacked: boolean;
  lastSeen: string;
}

export interface ScenarioOption {
  id: ScenarioId;
  label: string;
  description: string;
}

export interface AlertSnapshot {
  id: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  timestamp: string;
}

export interface CommandPlatformSnapshot {
  cityCenter: LatLngPoint;
  metrics: CommandMetrics;
  intersections: IntersectionSnapshot[];
  corridors: CorridorSnapshot[];
  hardware: HardwareSnapshot[];
  scenarios: ScenarioOption[];
  alerts: AlertSnapshot[];
  systemState: SystemState;
}
