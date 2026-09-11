import "server-only";

import type {
  EngineeringControllerDetailRecord,
  EngineeringControllerRecord,
  EngineeringIntersectionRecord,
} from "@/types/engineering-studio";

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
    throw new Error(`Engineering Studio login failed: ${response.status}`);
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
    throw new Error(`Engineering Studio request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function callBackend(
  path: string,
  init: RequestInit & { method: string },
): Promise<Response> {
  const accessToken = await getAccessToken();
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function deleteEngineeringIntersection(
  intersectionId: string,
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const response = await callBackend(
    `/engineering/intersections/${intersectionId}`,
    { method: "DELETE" },
  );
  if (response.ok) return { ok: true };
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body?.message)) detail = body.message.join("; ");
    else if (typeof body?.message === "string" && body.message)
      detail = body.message;
  } catch {
    /* not json */
  }
  return { ok: false, status: response.status, detail };
}

export async function fetchEngineeringIntersections() {
  return fetchBackendJson<EngineeringIntersectionRecord[]>("/engineering/intersections");
}

export async function fetchEngineeringIntersection(intersectionId: string) {
  return fetchBackendJson<EngineeringIntersectionRecord>(
    `/engineering/intersections/${intersectionId}`,
  );
}

export async function fetchEngineeringControllers(intersectionId?: string) {
  const suffix = intersectionId
    ? `?intersectionId=${encodeURIComponent(intersectionId)}`
    : "";

  return fetchBackendJson<EngineeringControllerRecord[]>(
    `/controller-manager/controllers${suffix}`,
  );
}

export async function fetchEngineeringController(controllerId: string) {
  return fetchBackendJson<EngineeringControllerDetailRecord>(
    `/controller-manager/controllers/${controllerId}`,
  );
}
