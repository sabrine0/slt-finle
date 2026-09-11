/**
 * Client for the STLS Traffic Intelligence / AI Assist backend.
 *
 * All requests go through the same /stls-api proxy used by the
 * command platform — no secrets are ever exposed in the browser
 * (GOOGLE_MAPS_API_KEY and GEMINI_API_KEY stay server-side).
 */
import {
  CommandPlatformApiError,
  getApiBaseUrl,
} from "@/lib/command-platform-api";

export type AiRecommendationAction =
  | "no_action"
  | "force_phase"
  | "extend_phase"
  | "reduce_phase"
  | "release";

export type AiRiskLevel = "low" | "medium" | "high";

export type AiRecommendationSource = "gemini" | "rule-based" | "fallback";

export type AiControlMode = "advisory" | "supervised" | "disabled";

export interface AiRecommendation {
  intersectionId: string;
  action: AiRecommendationAction;
  targetPhaseId: string | null;
  durationSeconds: number | null;
  reason: string;
  confidence: number;
  riskLevel: AiRiskLevel;
  requiresHumanApproval: boolean;
  safetyWarnings: string[];
  source: AiRecommendationSource;
  generatedAt: string;
}

export interface StoredRecommendation extends AiRecommendation {
  recordedAt: string;
  operatorHint?: string;
  allowAutoApplyRequested: boolean;
}

export type GoogleTrafficCongestion =
  | "free"
  | "light"
  | "moderate"
  | "heavy"
  | "severe";

export interface GoogleTrafficCorridor {
  label: string;
  durationSeconds: number;
  durationInTrafficSeconds: number;
  delayFactor: number;
  congestionLevel: GoogleTrafficCongestion;
}

export interface GoogleTrafficSnapshot {
  intersectionId: string;
  capturedAt: string;
  source: "google" | "fallback" | "disabled";
  corridors: GoogleTrafficCorridor[];
  note?: string;
}

export interface IntersectionIntelligenceContext {
  intersectionId: string;
  capturedAt: string;
  aiControlMode: AiControlMode;
  aiAutoApplyReal: boolean;
  intersection: {
    id: string;
    name: string;
    district: string;
    address: string;
    mode: string;
    status: string;
    queueLength: number;
    averageDelaySeconds: number;
    incidents: number;
    systemMode: "real" | "simulation";
  } | null;
  runtimeState: {
    activePhaseId: string | null;
    activePhaseLabel: string;
    phaseState: string;
    cycleSecond: number;
    cycleSeconds: number;
    commands: {
      manualOverride: boolean;
      forcedDirection: string | null;
      forcedPhaseId: string | null;
      modeOverride: string | null;
    };
  } | null;
  runtimeConfig: {
    phases: Array<{
      id: string;
      label: string;
      greenSignalGroupIds: string[];
      minGreenSeconds: number;
      yellowSeconds: number;
      redClearanceSeconds: number;
    }>;
    cycleSeconds: number;
  } | null;
  operator: {
    manualOverride: boolean;
    forcedDirection: string | null;
    modeOverride: string | null;
  };
  googleTraffic: GoogleTrafficSnapshot;
}

export interface AnalyzeTrafficPayload {
  reasonHint?: string;
  operatorGoal?: string;
  allowAutoApply?: boolean;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (networkError) {
    // Browsers throw a bare TypeError ("Failed to fetch" /
    // "NetworkError") before any HTTP response comes back when the
    // page bundle is older than the running backend, the backend is
    // unreachable, or a hard reload is needed. Turn that into an
    // actionable message rather than the cryptic default.
    const detail =
      networkError instanceof Error
        ? networkError.message
        : "unknown network error";
    throw new CommandPlatformApiError(
      0,
      `Cannot reach ${url} (${detail}) — try a hard-refresh (Ctrl+Shift+R) or check the backend is running.`,
    );
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as
        | { message?: string | string[] }
        | undefined;
      const message = body?.message;
      if (Array.isArray(message)) detail = message.join("; ");
      else if (typeof message === "string" && message.length > 0) detail = message;
    } catch {
      /* not JSON */
    }
    throw new CommandPlatformApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export async function fetchIntelligenceContext(intersectionId: string) {
  return requestJson<IntersectionIntelligenceContext>(
    `/traffic-intelligence/intersections/${encodeURIComponent(intersectionId)}/context`,
  );
}

export async function analyzeIntersection(
  intersectionId: string,
  payload: AnalyzeTrafficPayload = {},
) {
  return requestJson<AiRecommendation>(
    `/traffic-intelligence/intersections/${encodeURIComponent(intersectionId)}/analyze`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchRecommendations(intersectionId: string) {
  return requestJson<StoredRecommendation[]>(
    `/traffic-intelligence/intersections/${encodeURIComponent(intersectionId)}/recommendations`,
  );
}

// Display helpers — co-located so every panel renders the same tone
// and label for a given action / risk level.

export const actionLabel: Record<AiRecommendationAction, string> = {
  no_action: "No action",
  force_phase: "Force phase",
  extend_phase: "Extend phase",
  reduce_phase: "Reduce phase",
  release: "Release override",
};

export const riskTone: Record<AiRiskLevel, string> = {
  low: "text-[#a8eac2] border-[#1d4a34] bg-[#0d1913]",
  medium: "text-[#ffd089] border-[#5c4418] bg-[#141008]",
  high: "text-[#ff9a9a] border-[#5a1d1d] bg-[#180d0d]",
};

export const sourceLabel: Record<AiRecommendationSource, string> = {
  gemini: "Gemini 1.5",
  "rule-based": "Rule-based",
  fallback: "Fallback",
};

export const congestionTone: Record<GoogleTrafficCongestion, string> = {
  free: "text-[#a8eac2]",
  light: "text-[#c3cdc6]",
  moderate: "text-[#ffd089]",
  heavy: "text-[#ff9a9a]",
  severe: "text-[#ff5f5f]",
};

export const congestionDotBg: Record<GoogleTrafficCongestion, string> = {
  free: "bg-[#39d98a]",
  light: "bg-[#8fa39a]",
  moderate: "bg-[#ffb547]",
  heavy: "bg-[#ff8a8a]",
  severe: "bg-[#ff5f5f]",
};
