import { test, expect } from "@playwright/test";

test.describe("/studio landing @smoke", () => {
  test("loads without server error", async ({ page }) => {
    const response = await page.goto("/studio", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText(/internal server error/i);
  });

  test("shows either the controllers map OR the documented empty state", async ({
    page,
  }) => {
    await page.goto("/studio", { waitUntil: "domcontentloaded" });
    const body = page.locator("body");

    // Either the page shows the map with controllers, or the empty-state
    // banner. Both are acceptable; what we forbid is a crash.
    const text = await body.innerText();
    const hasEmptyState =
      /no controllers/i.test(text) && /set up an intersection/i.test(text);
    const hasMap = /coverage/i.test(text) && /controllers/i.test(text);

    expect(
      hasEmptyState || hasMap,
      "expected the landing to render either the empty-state hint or the map UI",
    ).toBeTruthy();
  });
});
