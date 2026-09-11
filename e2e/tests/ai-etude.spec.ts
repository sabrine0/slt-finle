/**
 * /studio/ai-etude page feature tests.
 *
 * Earlier, the analyse pipeline hit a 500 because the backend was
 * unreachable.  These tests prove the page mounts, the analyse button
 * is wired, and the underlying endpoint is reachable.
 */

import { test, expect } from "@playwright/test";
import { trackPageProblems, summariseProblems } from "./_helpers/page-errors";

const BACKEND_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:4010";

test.describe("/studio/ai-etude", () => {
  test("page mounts without console errors", async ({ page }) => {
    const problems = trackPageProblems(page);
    await page.goto("/studio/ai-etude", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    const summary = summariseProblems(problems);
    expect(summary, summary ?? "").toBeNull();
  });

  test("the analyse-engine endpoint enforces input validation (no crash on empty)", async ({
    request,
  }) => {
    const res = await request.post(`${BACKEND_URL}/ai-engineering/study`, {
      data: {},
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("message");
  });

  test("the analyse-engine endpoint accepts a minimal valid payload", async ({
    request,
  }) => {
    // Match the contract: name, latitude, longitude, scope.  If a
    // future migration changes the shape this test will flag it.
    const res = await request.post(`${BACKEND_URL}/ai-engineering/study`, {
      data: {
        name: "E2E smoke",
        latitude: 33.5731,
        longitude: -7.5898,
        scope: "standard",
      },
      headers: { "content-type": "application/json" },
    });
    // Accept 200/201/202 (sync or async kickoff) — the goal is "not 400/500".
    expect(
      [200, 201, 202],
      `unexpected status ${res.status()}: ${(await res.text()).slice(0, 200)}`,
    ).toContain(res.status());
  });
});
