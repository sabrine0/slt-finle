import "server-only";

import type {
  TrafficGraphCarrefourSummary,
  TrafficGraphConnectedView,
} from "@/types/traffic-graph";

function resolveServerBase(): string {
  const direct =
    process.env.STLS_API_INTERNAL_URL ?? process.env.STLS_API_PROXY_TARGET;
  if (direct) {
    return direct.replace(/\/$/, "");
  }
  const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (publicBase && /^https?:\/\//i.test(publicBase)) {
    return publicBase;
  }
  return "http://127.0.0.1:4010";
}

const API_BASE_URL = resolveServerBase();

function getEngineeringStudioCredentials() {
  const configuredEmail = process.env.ENGINEERING_STUDIO_EMAIL;
  const configuredPassword = process.env.ENGINEERING_STUDIO_PASSWORD;

  if (configuredEmail && configuredPassword) {
    return {
      email: configuredEmail,
      password: configuredPassword,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      email: "admin@stls.local",
      password: "ChangeMe123!",
    };
  }

  throw new Error("Engineering Studio service credentials are not configured.");
}

async function getAccessToken() {
  const credentials = getEngineeringStudioCredentials();
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Traffic graph login failed: ${response.status}`);
  }

  const payload = (await response.json()) as { accessToken: string };
  return payload.accessToken;
}

async function fetchBackendJson<T>(path: string): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Traffic graph request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchTrafficGraphCarrefours(cityId?: string) {
  const suffix = cityId ? `?cityId=${encodeURIComponent(cityId)}` : "";
  return fetchBackendJson<TrafficGraphCarrefourSummary[]>(
    `/traffic-graph/intersections${suffix}`,
  );
}

export async function fetchTrafficGraphConnections() {
  return fetchBackendJson<TrafficGraphConnectedView[]>(
    "/traffic-graph/connected-intersections",
  );
}
