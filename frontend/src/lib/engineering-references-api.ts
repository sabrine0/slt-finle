/**
 * Browser-side client for the Engineering Reference layer.
 * Mirrors the surface of the backend `engineering-references`,
 * `programme-packages`, `documents` and `document-ingest`
 * controllers.
 *
 * Reference content is read-only relative to live runtime — the
 * panels built on top of this client never deploy or modify a
 * controller; they only surface metadata + serve files for
 * inspection.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:4010";

export type EngineeringDocumentType =
  | "plan_rs"
  | "dossier_regulation"
  | "plan_filaire";

export interface EngineeringDocument {
  id: string;
  documentType: EngineeringDocumentType;
  city: string;
  corridor: string;
  shortCode: string | null;
  carrefourLabel: string | null;
  title: string;
  revision: string | null;
  fileName: string;
  fileSizeBytes: string;
  sha256: string | null;
  sourceLastModified: string | null;
  ingestedAt: string;
  intersectionId: string | null;
  controllerId: string | null;
  parseNotes: string | null;
}

export type ProgrammeInnerKind = "clp9" | "wpr" | "pdf" | "other";

export interface ProgrammeInnerFile {
  innerPath: string;
  kind: ProgrammeInnerKind;
  sizeBytes: number;
}

export interface ProgrammePackage {
  id: string;
  packageName: string;
  city: string;
  shortCode: string | null;
  fileName: string;
  fileSizeBytes: string;
  sha256: string | null;
  sourceLastModified: string | null;
  ingestedAt: string;
  contents: ProgrammeInnerFile[];
  detectedVersion: string | null;
  intersectionId: string | null;
  controllerId: string | null;
  isReferenceOnly: boolean;
}

export interface IntersectionReferences {
  intersection: {
    id: string;
    code: string;
    name: string;
  } | null;
  documents: EngineeringDocument[];
  programmePackages: ProgrammePackage[];
}

export interface ControllerReferences {
  controller: {
    id: string;
    code: string;
  } | null;
  programmePackages: ProgrammePackage[];
  documents: EngineeringDocument[];
}

export interface BenchmarkSummary {
  intersection: { id: string; code: string; name: string } | null;
  stls: {
    controllerCount: number;
    phaseCount: number;
    detectorCount: number;
    timingPlanCount: number;
  };
  reference: {
    planRsDocuments: number;
    dossierRegulationDocuments: number;
    planFilaireDocuments: number;
    programmePackages: number;
    programmePackagesWithClp9: number;
  };
  delta: {
    phaseCount: number | null;
    movementCount: number | null;
    supportCount: number | null;
    detectorCount: number | null;
  };
}

export interface DocumentIngestRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed";
  rootPath: string;
  filesScanned: number;
  documentsCreated: number;
  documentsUpdated: number;
  programmePackagesCreated: number;
  programmePackagesUpdated: number;
  skipped: number;
  errored: number;
  errors: Array<{ path: string; message: string }>;
  notes: string | null;
}

export interface IngestStatus {
  configured: boolean;
  root: string | null;
}

export interface ReferenceCounts {
  documents: {
    total: number;
    linked: number;
    unlinked: number;
  };
  programmePackages: {
    total: number;
    linked: number;
    unlinked: number;
  };
}

export interface ReferenceLinkPayload {
  intersectionId?: string | null;
  controllerId?: string | null;
}

export interface ListReferencesQuery {
  documentType?: EngineeringDocumentType;
  city?: string;
  shortCode?: string;
  corridor?: string;
  intersectionId?: string;
  controllerId?: string;
  linked?: "linked" | "unlinked";
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
      const body = (await response.json()) as { message?: string | string[] };
      const msg = body?.message;
      if (Array.isArray(msg)) detail = msg.join("; ");
      else if (typeof msg === "string" && msg) detail = msg;
    } catch {
      /* not json */
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    searchParams.set(key, value);
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listReferences(
  query: ListReferencesQuery = {},
): Promise<EngineeringDocument[]> {
  return request<EngineeringDocument[]>(
    `/engineering-references${buildQuery({
      documentType: query.documentType,
      city: query.city,
      shortCode: query.shortCode,
      corridor: query.corridor,
      intersectionId: query.intersectionId,
      controllerId: query.controllerId,
      linked: query.linked,
    })}`,
  );
}

export function listReferencesForIntersection(
  codeOrId: string,
): Promise<IntersectionReferences> {
  return request<IntersectionReferences>(
    `/engineering-references/by-intersection/${encodeURIComponent(codeOrId)}`,
  );
}

export function listReferencesForController(
  codeOrId: string,
): Promise<ControllerReferences> {
  return request<ControllerReferences>(
    `/engineering-references/by-controller/${encodeURIComponent(codeOrId)}`,
  );
}

export function getBenchmarkSummary(
  codeOrId: string,
): Promise<BenchmarkSummary> {
  return request<BenchmarkSummary>(
    `/engineering-references/benchmark/${encodeURIComponent(codeOrId)}`,
  );
}

export function listShortCodes(): Promise<
  Array<{ code: string; label: string }>
> {
  return request<Array<{ code: string; label: string }>>(
    `/engineering-references/short-codes`,
  );
}

export function getReferenceCounts(): Promise<ReferenceCounts> {
  return request<ReferenceCounts>(`/engineering-references/counts`);
}

export function getIngestStatus(): Promise<IngestStatus> {
  return request<IngestStatus>(`/document-ingest/status`);
}

export function listIngestRuns(limit = 10): Promise<DocumentIngestRun[]> {
  return request<DocumentIngestRun[]>(
    `/document-ingest/runs?limit=${encodeURIComponent(String(limit))}`,
  );
}

export function triggerIngestScan(
  options: { force?: boolean } = {},
): Promise<DocumentIngestRun> {
  return request<DocumentIngestRun>(`/document-ingest/scan`, {
    method: "POST",
    body: JSON.stringify({ force: options.force === true }),
  });
}

export function linkReference(
  documentId: string,
  payload: ReferenceLinkPayload,
): Promise<EngineeringDocument> {
  return request<EngineeringDocument>(
    `/engineering-references/${encodeURIComponent(documentId)}/link`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function unlinkReference(documentId: string): Promise<EngineeringDocument> {
  return request<EngineeringDocument>(
    `/engineering-references/${encodeURIComponent(documentId)}/unlink`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function listProgrammePackages(): Promise<ProgrammePackage[]> {
  return request<ProgrammePackage[]>(`/programme-packages`);
}

export function linkProgrammePackage(
  packageId: string,
  payload: ReferenceLinkPayload,
): Promise<ProgrammePackage> {
  return request<ProgrammePackage>(
    `/programme-packages/${encodeURIComponent(packageId)}/link`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function unlinkProgrammePackage(
  packageId: string,
): Promise<ProgrammePackage> {
  return request<ProgrammePackage>(
    `/programme-packages/${encodeURIComponent(packageId)}/unlink`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

/** Direct file URL — used in <a href> / <iframe src>. */
export function engineeringDocumentFileUrl(documentId: string): string {
  return `${API_BASE_URL}/documents/engineering/${encodeURIComponent(documentId)}/file`;
}

export function programmePackageFileUrl(packageId: string): string {
  return `${API_BASE_URL}/documents/programme/${encodeURIComponent(packageId)}/file`;
}
