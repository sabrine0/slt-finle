/**
 * Dossier-export feature test.
 *
 * Clicks each of the three "Export …" buttons on the AutoCAD page and
 * asserts that:
 *   1. A download event is triggered.
 *   2. The saved file looks like a PDF (starts with %PDF-).
 *   3. The PDF is non-trivial in size (rules out empty / error PDFs).
 *
 * Also covers the regression we just fixed: the new PDF layers
 * (OSM base, refuge islands, movement arrows) should bulk up the
 * generated PDF noticeably vs. the previous empty-template baseline.
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { firstIntersectionId } from "./_helpers/fixtures";

async function openAutocad(page: import("@playwright/test").Page) {
  const id = await firstIntersectionId();
  expect(id).not.toBeNull();
  await page.goto(`/studio/autocad/${id}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("svg").first()).toBeVisible({ timeout: 20_000 });
}

async function clickAndCapture(
  page: import("@playwright/test").Page,
  buttonName: RegExp,
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stls-e2e-pdf-"));
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: buttonName }).click(),
  ]);
  const suggested = download.suggestedFilename();
  const dest = path.join(tmpDir, suggested);
  await download.saveAs(dest);
  return dest;
}

async function assertIsPdf(
  filePath: string,
  minBytes: number,
  minPages = 1,
) {
  const stat = await fs.stat(filePath);
  expect(
    stat.size,
    `${path.basename(filePath)} is suspiciously small (${stat.size} B)`,
  ).toBeGreaterThan(minBytes);
  const bytes = await fs.readFile(filePath, { encoding: "binary" });
  expect(bytes.slice(0, 5)).toBe("%PDF-");
  // Multi-page dossiers should expose at least N /Type /Page objects.
  const pages = (bytes.match(/\/Type\s*\/Page\b/g) ?? []).length;
  expect(
    pages,
    `${path.basename(filePath)} has ${pages} pages, expected ≥ ${minPages}`,
  ).toBeGreaterThanOrEqual(minPages);
}

test.describe("Dossier PDF export", () => {
  test("Export Plan PDF produces a valid single-page PDF", async ({ page }) => {
    await openAutocad(page);
    const file = await clickAndCapture(page, /export plan pdf/i);
    // Single-page plan with vectors; CAR-0001 ≈ 30 KB so 10 KB is a safe floor.
    await assertIsPdf(file, 10_000, 1);
  });

  test("Export Dossier Régulation produces a valid multi-page PDF", async ({
    page,
  }) => {
    await openAutocad(page);
    const file = await clickAndCapture(page, /export dossier r[ée]gulation/i);
    // Dossier has cover + identity + plan + phases — ≥ 3 pages.
    await assertIsPdf(file, 20_000, 3);
  });

  test("Export Dossier Câblage produces a valid multi-page PDF", async ({ page }) => {
    await openAutocad(page);
    const file = await clickAndCapture(page, /export dossier c[âa]blage/i);
    // Cover + plan + carnet + quantitatif — ≥ 3 pages.
    await assertIsPdf(file, 20_000, 3);
  });
});
