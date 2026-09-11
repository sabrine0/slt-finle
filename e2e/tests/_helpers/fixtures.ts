import { request, type APIRequestContext } from "@playwright/test";

const BACKEND_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:4010";

interface Cache {
  intersectionId?: string;
  controllerId?: string;
  cityId?: string;
  corridorId?: string;
  zoneProposalId?: string;
  etudeId?: string;
}

const cache: Cache = {};
let apiContext: APIRequestContext | null = null;

let cachedToken: string | null = null;

async function api(): Promise<APIRequestContext> {
  if (!apiContext) apiContext = await request.newContext();
  return apiContext;
}

/**
 * Acquire a Bearer token from the dev admin account.  Mirrors the
 * pattern in frontend/src/lib/engineering-studio-server.ts so test
 * traffic looks identical to what the SSR pass sends.
 */
export async function authToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    const ctx = await api();
    const res = await ctx.post(`${BACKEND_URL}/auth/login`, {
      data: { email: "admin@stls.local", password: "ChangeMe123!" },
      headers: { "content-type": "application/json" },
    });
    if (!res.ok()) return null;
    const body = (await res.json()) as { accessToken?: string };
    cachedToken = body.accessToken ?? null;
    return cachedToken;
  } catch {
    return null;
  }
}

async function getJson<T>(path: string, auth = false): Promise<T | null> {
  try {
    const ctx = await api();
    const headers: Record<string, string> = {};
    if (auth) {
      const token = await authToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await ctx.get(`${BACKEND_URL}${path}`, { headers });
    if (!res.ok()) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function firstIntersectionId(): Promise<string | null> {
  if (cache.intersectionId) return cache.intersectionId;
  const list = await getJson<Array<{ id: string }>>("/engineering/intersections");
  if (!list || !list.length) return null;
  cache.intersectionId = list[0].id;
  return cache.intersectionId;
}

export async function firstControllerId(): Promise<string | null> {
  if (cache.controllerId) return cache.controllerId;
  // /controller-manager/* requires the engineering-studio bearer token.
  const list = await getJson<Array<{ id: string }>>(
    "/controller-manager/controllers",
    true,
  );
  if (!list || !list.length) return null;
  cache.controllerId = list[0].id;
  return cache.controllerId;
}

export async function firstCityId(): Promise<string | null> {
  if (cache.cityId) return cache.cityId;
  // Derive a "city" identifier from the first intersection's district —
  // the network page accepts a city slug in the URL.
  const list = await getJson<Array<{ district?: string }>>(
    "/engineering/intersections",
  );
  if (!list || !list.length) return null;
  const district = list.find((i) => i.district)?.district ?? "casablanca";
  cache.cityId = district.toLowerCase().replace(/\s+/g, "-");
  return cache.cityId;
}
