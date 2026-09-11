import { getApiBaseUrl } from "@/lib/command-platform-api";

export type ProjectStatus =
  | "draft"
  | "active"
  | "sealed"
  | "deployed"
  | "archived";

export type OrganizationType =
  | "agency"
  | "contractor"
  | "ministry"
  | "operator";

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  clientReference: string | null;
  organization: {
    id: string;
    code: string;
    name: string;
    type: OrganizationType;
  };
  sites: Array<{
    id: string;
    code: string;
    name: string;
    city: string | null;
    region: string | null;
  }>;
  intersectionCount: number;
}

function resolveBackendBase(): string {
  if (typeof window !== "undefined") {
    return getApiBaseUrl();
  }
  const serverBase =
    process.env.STLS_API_INTERNAL_URL ??
    process.env.STLS_API_PROXY_TARGET ??
    "http://127.0.0.1:4010";
  return serverBase.replace(/\/$/, "");
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${resolveBackendBase()}/projects`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to load projects: ${response.status}`);
  }
  return (await response.json()) as ProjectSummary[];
}
