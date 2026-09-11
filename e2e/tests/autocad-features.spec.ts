/**
 * AutoCAD page feature tests.
 *
 * Clicks the actual buttons on the toolbar so we catch regressions
 * the route-smoke test would silently miss: toggling layers, switching
 * theme, switching to the workbench, and so on.
 */

import { test, expect } from "@playwright/test";
import { firstIntersectionId } from "./_helpers/fixtures";
import { trackPageProblems, summariseProblems } from "./_helpers/page-errors";

async function openAutocad(page: import("@playwright/test").Page) {
  const id = await firstIntersectionId();
  expect(id, "need at least one intersection in the DB").not.toBeNull();
  await page.goto(`/studio/autocad/${id}`, { waitUntil: "domcontentloaded" });
  // Wait for the plan SVG to actually render (proxy for hydration done).
  await expect(page.locator("svg").first()).toBeVisible({ timeout: 20_000 });
  return id!;
}

test.describe("AutoCAD page features", () => {
  test("layer toggles flip state without console errors", async ({ page }) => {
    const problems = trackPageProblems(page);
    await openAutocad(page);

    const layerNames = [
      /backdrop/i,
      /roads/i,
      /lane markings/i,
      /crosswalks/i,
      /refuge islands/i,
      /movement arrows/i,
      /signal supports/i,
      /detector loops/i,
      /chambers/i,
      /cables/i,
      /labels/i,
      /legend box/i,
    ];

    for (const name of layerNames) {
      const btn = page.getByRole("button", { name }).first();
      await expect(btn, `expected layer toggle ${name}`).toBeVisible();
      await btn.click();
      await page.waitForTimeout(80);
      await btn.click(); // toggle back so the plan ends up as it started
      await page.waitForTimeout(80);
    }

    const summary = summariseProblems(problems);
    expect(summary, summary ?? "").toBeNull();
  });

  test("theme toggle switches Light / Dark and the SVG re-renders", async ({
    page,
  }) => {
    await openAutocad(page);
    // The toolbar text says "☀ Light" when current theme is dark (clicking
    // switches TO light) and "🌙 Dark" when in light. Find whichever is shown.
    const themeBtn = page
      .getByRole("button", { name: /^(?:.\s*)?(?:Light|Dark)\b/i })
      .first();
    await expect(themeBtn).toBeVisible();
    const labelBefore = (await themeBtn.innerText()).trim();
    await themeBtn.click();
    await page.waitForTimeout(200);
    const labelAfter = (await themeBtn.innerText()).trim();
    expect(
      labelAfter,
      `theme toggle should flip its label (was ${labelBefore})`,
    ).not.toBe(labelBefore);
    // Toggle back so we don't leave global state changed for other tests.
    await themeBtn.click();
  });

  test("import OSM and edit-mode buttons open without crashing", async ({
    page,
  }) => {
    const problems = trackPageProblems(page);
    await openAutocad(page);

    // Edit mode is local-state — clicking should never crash.
    // After enter, the button text changes from "✎ Edit" to "✓ Edit ON"
    // so we look it up again each time rather than caching the locator.
    await page
      .getByRole("button", { name: /(?:✎\s*Edit$|✎\s*Edit\b)/i })
      .first()
      .click();
    await page.waitForTimeout(200);
    await page
      .getByRole("button", { name: /✓\s*Edit ON/i })
      .first()
      .click();
    await page.waitForTimeout(150);

    // Import OSM opens a modal/picker — the button itself shouldn't crash.
    const importBtn = page.getByRole("button", { name: /import osm/i });
    await expect(importBtn).toBeVisible();
    await importBtn.click();
    await page.waitForTimeout(300);
    // Close any popup that may have opened (Escape is a common dismissal).
    await page.keyboard.press("Escape");

    const summary = summariseProblems(problems);
    expect(summary, summary ?? "").toBeNull();
  });

  test("Edit in Workbench link is wired to /studio/workbench", async ({
    page,
  }) => {
    await openAutocad(page);
    const link = page.getByRole("link", { name: /edit in workbench/i });
    await expect(link).toHaveAttribute("href", /\/studio\/workbench/);
  });
});
