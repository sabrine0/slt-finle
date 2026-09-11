import type {
  CommandPlatformSnapshot,
  IntersectionMode,
  OperatorDirection,
  ScenarioId,
} from "@/types/command-platform";
import type { PredictionHorizon, PredictionRunResult } from "@/types/prediction";
import type {
  BackendCityView,
  BackendRoadLinkView,
  BackendScopePredictionSnapshot,
  BackendZoneView,
} from "@/types/backend-topology";
import type {
  TrafficGraphCarrefourSummary,
  TrafficGraphConnectedView,
} from "@/types/traffic-graph";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:4010";

export class CommandPlatformApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail || `Request failed with status ${status}`);
    this.name = "CommandPlatformApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const errorBody = (await response.json()) as
        | { message?: string | string[] }
        | undefined;
      const message = errorBody?.message;
      if (Array.isArray(message)) {
        detail = message.join("; ");
      } else if (typeof message === "string" && message.length > 0) {
        detail = message;
      }
    } catch {
      /* body was not JSON */
    }
    throw new CommandPlatformApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getSocketConnectionConfig() {
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    return {
      url: API_BASE_URL,
      path: "/socket.io/",
      transports: ["websocket", "polling"] as Array<"websocket" | "polling">,
    };
  }

  const normalizedBase =
    API_BASE_URL.length > 0
      ? API_BASE_URL.startsWith("/")
        ? API_BASE_URL
        : `/${API_BASE_URL}`
      : "";

  return {
    url: undefined,
    path: `${normalizedBase.replace(/\/$/, "")}/socket.io/`,
    transports: ["polling"] as Array<"websocket" | "polling">,
  };
}

export interface PlatformMeta {
  service: string;
  environment: string;
  jwtIssuer: string;
  serverTime: string;
}

export async function fetchPlatformMeta() {
  return requestJson<PlatformMeta>("/meta");
}

export async function fetchCommandPlatformBootstrap() {
  return requestJson<CommandPlatformSnapshot>("/command-platform/bootstrap");
}

export async function fetchTrafficGraphIntersections() {
  return requestJson<TrafficGraphCarrefourSummary[]>(
    "/traffic-graph/intersections",
  );
}

export async function fetchTrafficGraphConnections() {
  return requestJson<TrafficGraphConnectedView[]>(
    "/traffic-graph/connected-intersections",
  );
}

export async function fetchBackendCities() {
  return requestJson<BackendCityView[]>("/cities");
}

export async function fetchBackendZones(cityId?: string) {
  const suffix = cityId ? `?cityId=${encodeURIComponent(cityId)}` : "";
  return requestJson<BackendZoneView[]>(`/zones${suffix}`);
}

export async function fetchBackendRoadLinks(cityId?: string, zoneId?: string) {
  const params = new URLSearchParams();
  if (cityId) params.set("cityId", cityId);
  if (zoneId) params.set("zoneId", zoneId);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestJson<BackendRoadLinkView[]>(`/road-links${suffix}`);
}

export async function fetchCityPredictionSnapshot(
  cityId: string,
  horizon: PredictionHorizon = "H+15",
) {
  return requestJson<BackendScopePredictionSnapshot>(
    `/prediction-snapshots/cities/${encodeURIComponent(cityId)}?horizon=${encodeURIComponent(horizon)}`,
  );
}

export async function fetchZonePredictionSnapshot(
  zoneId: string,
  horizon: PredictionHorizon = "H+15",
) {
  return requestJson<BackendScopePredictionSnapshot>(
    `/prediction-snapshots/zones/${encodeURIComponent(zoneId)}?horizon=${encodeURIComponent(horizon)}`,
  );
}

// ───── Agent visualization layers (heatmap + anticipation) ─────

export interface BackendHeatPoint {
  id: string;
  intersectionId: string;
  label: string;
  location: { lat: number; lng: number };
  trafficState: "smooth" | "pressure" | "congestion";
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
  intensity: number;
  radiusMetres: number;
}

export interface BackendHeatSegment {
  id: string;
  fromIntersectionId: string;
  toIntersectionId: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  trafficState: "smooth" | "pressure" | "congestion";
  intensity: number;
  spillbackRisk: number | null;
  distanceMetres: number | null;
}

export interface BackendHeatmapPayload {
  scope: string;
  scopeRef: string;
  horizon: string;
  generatedAt: string;
  pointCount: number;
  segmentCount: number;
  points: BackendHeatPoint[];
  segments: BackendHeatSegment[];
  hottest: { intersectionId: string; label: string; intensity: number } | null;
}

export interface BackendAnticipationCause {
  type: string;
  label: string;
  detail: string;
  weight: number;
}

export interface BackendTrafficInsight {
  id: string;
  emoji: string;
  title: string;
  summary: string;
  detail: string;
  location: { lat: number; lng: number };
  trafficState: "smooth" | "pressure" | "congestion";
  anticipatedState: "smooth" | "pressure" | "congestion";
  leadTimeMinutes: number;
  confidence: number;
  saturationForecast: number;
  causes: BackendAnticipationCause[];
}

export interface BackendAnticipationPayload {
  scope: string;
  scopeRef: string;
  horizon: string;
  generatedAt: string;
  leadTimeMinutes: number;
  insightCount: number;
  insights: BackendTrafficInsight[];
  causeSummary: Record<string, number>;
  liveTrafficSource: "google" | "fallback" | "disabled" | "none";
}

export interface BackendAgentVisualizationLayers {
  scope: string;
  scopeRef: string;
  horizon: string;
  generatedAt: string;
  heatmap: BackendHeatmapPayload | null;
  anticipation: BackendAnticipationPayload | null;
}

/**
 * Read-only heatmap + anticipation layers from the visualization
 * agents. No side effects on the backend (no persistence, no runtime
 * commands) — safe to call whenever the operator scope changes.
 */
export async function fetchTrafficAgentLayers(
  scope: "city" | "zone",
  id: string,
  horizon: PredictionHorizon = "H+15",
) {
  return requestJson<BackendAgentVisualizationLayers>(
    `/agents/visualization/${scope}/${encodeURIComponent(id)}?horizon=${encodeURIComponent(horizon)}`,
  );
}

export async function runTrafficPrediction(
  carrefourId: string,
  horizon?: PredictionHorizon,
) {
  return requestJson<PredictionRunResult>("/prediction/run", {
    method: "POST",
    body: JSON.stringify({ carrefourId, horizon }),
  });
}

export async function runScenario(scenarioId: ScenarioId) {
  return requestJson<CommandPlatformSnapshot>("/command-platform/scenarios/run", {
    method: "POST",
    body: JSON.stringify({ scenarioId }),
  });
}

export async function stopSystem() {
  return requestJson<CommandPlatformSnapshot>("/command-platform/system/stop", {
    method: "POST",
  });
}

export async function setIntersectionOverride(
  intersectionId: string,
  engaged: boolean,
) {
  return requestJson<CommandPlatformSnapshot>(
    `/command-platform/intersections/${encodeURIComponent(intersectionId)}/override`,
    {
      method: "POST",
      body: JSON.stringify({ engaged }),
    },
  );
}

export async function setIntersectionForcedGreen(
  intersectionId: string,
  direction: OperatorDirection | null,
) {
  return requestJson<CommandPlatformSnapshot>(
    `/command-platform/intersections/${encodeURIComponent(intersectionId)}/force-green`,
    {
      method: "POST",
      body: JSON.stringify({ direction }),
    },
  );
}

export async function setIntersectionMode(
  intersectionId: string,
  mode: IntersectionMode,
  confirmed?: boolean,
) {
  return requestJson<CommandPlatformSnapshot>(
    `/command-platform/intersections/${encodeURIComponent(intersectionId)}/mode`,
    {
      method: "POST",
      body: JSON.stringify({ mode, confirmed }),
    },
  );
}

export type OverrideAction =
  | "force_phase"
  | "force_green"
  | "release"
  | "mode_change"
  | "emergency";

export type OverrideReasonCode =
  | "incident"
  | "emergency_vehicle"
  | "congestion_relief"
  | "maintenance"
  | "event"
  | "pedestrian_safety"
  | "fault_recovery"
  | "drill"
  | "other";

export interface OverrideLogPayload {
  action: OverrideAction;
  reasonCode: OverrideReasonCode;
  note?: string;
  durationSeconds?: number;
  targetReference?: string;
}

export interface OverrideLogResponse {
  id: string;
  intersectionCode: string;
  action: OverrideAction;
  reasonCode: OverrideReasonCode;
  note: string | null;
  result: "accepted" | "rejected" | "expired" | "released";
  durationSeconds: number | null;
  issuedAt: string;
  expiresAt: string | null;
  operatorUserId: string | null;
}

export async function logOverride(
  intersectionCode: string,
  payload: OverrideLogPayload,
) {
  return requestJson<OverrideLogResponse>(
    `/overrides/${encodeURIComponent(intersectionCode)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function listRecentOverrides(intersectionCode: string) {
  return requestJson<OverrideLogResponse[]>(
    `/overrides/${encodeURIComponent(intersectionCode)}`,
  );
}
