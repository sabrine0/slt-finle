import { test, expect } from "@playwright/test";

test.describe("/engineering page @smoke", () => {
  test("loads and renders at least one intersection code (CAR-XXXX or INT-XXX)", async ({
    page,
  }) => {
    const response = await page.goto("/engineering", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status(), "/engineering should return 200").toBe(200);

    const html = await page.content();
    const codes = Array.from(
      new Set(html.match(/(CAR-\d{4}|INT-[A-Z]+-\d+)/g) ?? []),
    );
    expect(
      codes.length,
      "expected at least one intersection code rendered server-side",
    ).toBeGreaterThan(0);

    // Sanity: at least the first carrefour code is present and the page is
    // not just an error screen.
    await expect(page.locator("body")).not.toContainText(/internal server error/i);
  });

  test("renders the full inventory we expect (>= 100 unique codes)", async ({ page }) => {
    await page.goto("/engineering", { waitUntil: "domcontentloaded" });
    const html = await page.content();
    const codes = Array.from(
      new Set(html.match(/(CAR-\d{4}|INT-[A-Z]+-\d+)/g) ?? []),
    );
    expect(
      codes.length,
      "the seeded DB should expose well over 100 intersections in the page payload",
    ).toBeGreaterThanOrEqual(100);
  });
});
