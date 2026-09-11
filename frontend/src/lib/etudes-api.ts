/**
 * Browser-side client for the étude carrefour generator.
 *
 * Mirrors the surface of the EtudesController. All calls are made
 * against the public API base URL — étude routes are dev-public so
 * no auth header is required when running locally.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:4010";

export type EtudeSectionStatus = "pending" | "generated" | "edited" | "locked";
export type EtudeStatus = "draft" | "in_review" | "approved";
export type EtudeScope = "standard" | "tram" | "cablage";

export interface EtudeSectionRecord {
  id: string;
  status: EtudeSectionStatus;
  version: number;
  content: Record<string, unknown> | null;
  generatedAt: string | null;
  lockedAt: string | null;
  edits: Array<{ at: string; note: string }>;
}

export interface EtudeView {
  id: string;
  intersectionCode: string | null;
  intersectionLabel: string;
  latitude: number | null;
  longitude: number | null;
  scope: EtudeScope;
  status: EtudeStatus;
  generationMode: "offline" | "claude";
  sections: Record<string, EtudeSectionRecord>;
  catalog: Array<{
    id: string;
    title: string;
    order: number;
    description: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEtudeInput {
  intersectionCode?: string | null;
  intersectionLabel: string;
  latitude?: number | null;
  longitude?: number | null;
  scope?: EtudeScope;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
      const body = (await response.json()) as
        | { message?: string | string[] }
        | undefined;
      const msg = body?.message;
      if (Array.isArray(msg)) detail = msg.join("; ");
      else if (typeof msg === "string" && msg) detail = msg;
    } catch {
      /* not json */
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function listEtudes() {
  return request<EtudeView[]>("/etudes");
}

export function getEtude(id: string) {
  return request<EtudeView>(`/etudes/${id}`);
}

export function createEtude(input: CreateEtudeInput) {
  return request<EtudeView>("/etudes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function generateEtudeSection(etudeId: string, sectionId: string) {
  return request<EtudeView>(
    `/etudes/${etudeId}/sections/${sectionId}/generate`,
    { method: "POST" },
  );
}

export function patchEtudeSection(
  etudeId: string,
  sectionId: string,
  body: { content: Record<string, unknown>; note?: string; lock?: boolean },
) {
  return request<EtudeView>(`/etudes/${etudeId}/sections/${sectionId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function unlockEtudeSection(etudeId: string, sectionId: string) {
  return request<EtudeView>(
    `/etudes/${etudeId}/sections/${sectionId}/unlock`,
    { method: "POST" },
  );
}

export function deleteEtude(id: string) {
  return request<void>(`/etudes/${id}`, { method: "DELETE" });
}
