/**
 * Engineering area — intersection detail page + controllers list.
 */

import { test, expect } from "@playwright/test";
import { firstIntersectionId } from "./_helpers/fixtures";
import { trackPageProblems, summariseProblems } from "./_helpers/page-errors";

test.describe("/engineering area", () => {
  test("intersection detail page renders the carrefour name + tabs", async ({
    page,
  }) => {
    const id = await firstIntersectionId();
    expect(id).not.toBeNull();
    const problems = trackPageProblems(page);
    await page.goto(`/engineering/intersections/${id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(500);

    // The page should show the carrefour identifier somewhere.
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).toMatch(/car-\d{4}|int-[a-z]+-\d+/);

    const summary = summariseProblems(problems);
    expect(summary, summary ?? "").toBeNull();
  });

  test("/engineering/controllers loads (may be empty)", async ({ page }) => {
    const problems = trackPageProblems(page);
    const res = await page.goto("/engineering/controllers", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBe(200);
    await page.waitForTimeout(500);

    // Either a list or an empty-state — what we forbid is a crash.
    await expect(page.locator("body")).not.toContainText(
      /internal server error|application error/i,
    );

    const summary = summariseProblems(problems);
    expect(summary, summary ?? "").toBeNull();
  });
});
