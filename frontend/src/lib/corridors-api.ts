import type {
  ActivateCorridorScenarioPayload,
  CorridorControlSessionView,
  CorridorOverridePayload,
  CorridorRuntimeSnapshot,
  CorridorSummary,
  ReleaseCorridorControlPayload,
} from "@/types/corridors";

import { getApiBaseUrl } from "./command-platform-api";

export class CorridorsApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail || `Request failed with status ${status}`);
    this.name = "CorridorsApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
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
      const body = (await response.json()) as
        | { message?: string | string[] }
        | undefined;
      const message = body?.message;
      if (Array.isArray(message)) detail = message.join("; ");
      else if (typeof message === "string" && message.length > 0)
        detail = message;
    } catch {
      /* not JSON */
    }
    throw new CorridorsApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export async function listCorridors() {
  return requestJson<CorridorSummary[]>("/corridors");
}

export async function getCorridor(corridorId: string) {
  return requestJson<CorridorSummary>(
    `/corridors/${encodeURIComponent(corridorId)}`,
  );
}

export async function getCorridorRuntime(corridorId: string) {
  return requestJson<CorridorRuntimeSnapshot>(
    `/corridors/${encodeURIComponent(corridorId)}/runtime`,
  );
}

export async function activateCorridorScenario(
  corridorId: string,
  payload: ActivateCorridorScenarioPayload,
) {
  return requestJson<{
    session: CorridorControlSessionView;
    snapshot: CorridorRuntimeSnapshot;
  }>(`/corridors/${encodeURIComponent(corridorId)}/scenarios/activate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendCorridorOverride(
  corridorId: string,
  payload: CorridorOverridePayload,
) {
  return requestJson<{
    session: CorridorControlSessionView;
    snapshot: CorridorRuntimeSnapshot;
  }>(`/corridors/${encodeURIComponent(corridorId)}/control/override`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function releaseCorridorControl(
  corridorId: string,
  payload: ReleaseCorridorControlPayload,
) {
  return requestJson<{
    released: CorridorControlSessionView[];
    snapshot: CorridorRuntimeSnapshot;
  }>(`/corridors/${encodeURIComponent(corridorId)}/control/release`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
