/**
 * Backend read-endpoint smoke matrix.
 *
 * Hits the API endpoints the frontend depends on, asserts:
 *  - 2xx status
 *  - JSON body parses
 *  - Body has the expected shape (array vs. object)
 *
 * Catches the class of bug we saw earlier where the backend crashed
 * silently with a 25P02 Postgres error and every page fell through to
 * an empty state.
 */

import { test, expect } from "@playwright/test";
import { authToken } from "./_helpers/fixtures";

const BACKEND_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:4010";

interface Endpoint {
  path: string;
  shape: "array" | "object" | "any";
  /** When true, 404 is acceptable (endpoint may not exist in every build). */
  optional?: boolean;
  minLength?: number;
  /** When true, attach the engineering-studio bearer token. */
  auth?: boolean;
}

const ENDPOINTS: Endpoint[] = [
  { path: "/engineering/intersections", shape: "array", minLength: 1 },
  { path: "/controller-manager/controllers", shape: "array", auth: true },
  // Common reference endpoints — surface 5xx fast if they regress.
  { path: "/health", shape: "any", optional: true },
  { path: "/observability/health", shape: "any", optional: true },
];

for (const ep of ENDPOINTS) {
  test(`GET ${ep.path}`, async ({ request }) => {
    const headers: Record<string, string> = {};
    if (ep.auth) {
      const token = await authToken();
      expect(token, "auth login failed").not.toBeNull();
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await request.get(`${BACKEND_URL}${ep.path}`, { headers });
    if (ep.optional && res.status() === 404) {
      test.skip(true, `${ep.path} not exposed in this build`);
    }
    expect(
      res.status(),
      `${ep.path} returned ${res.status()} ${res.statusText()}`,
    ).toBeLessThan(400);
    if (ep.shape === "any") return;
    const body = await res.json();
    if (ep.shape === "array") {
      expect(Array.isArray(body), `${ep.path} should return an array`).toBeTruthy();
      if (ep.minLength != null) {
        expect(body.length).toBeGreaterThanOrEqual(ep.minLength);
      }
    } else {
      expect(typeof body, `${ep.path} should return an object`).toBe("object");
      expect(Array.isArray(body)).toBeFalsy();
    }
  });
}

test("intersection detail endpoint returns the same record by id", async ({
  request,
}) => {
  const list = await (
    await request.get(`${BACKEND_URL}/engineering/intersections`)
  ).json();
  expect(list.length).toBeGreaterThan(0);
  const first = list[0];
  const detail = await (
    await request.get(`${BACKEND_URL}/engineering/intersections/${first.id}`)
  ).json();
  expect(detail.id).toBe(first.id);
  expect(detail.code).toBe(first.code);
});
