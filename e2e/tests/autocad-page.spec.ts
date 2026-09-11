import { test, expect, request } from "@playwright/test";

const BACKEND_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:4010";

test.describe("/studio/autocad/[id] page @smoke", () => {
  test("opens with the first intersection from the DB and renders the SVG plan", async ({
    page,
  }) => {
    // Fetch a real intersection ID from the backend so the test stays
    // resilient to DB changes.
    const api = await request.newContext();
    const res = await api.get(`${BACKEND_URL}/engineering/intersections`);
    expect(res.ok()).toBeTruthy();
    const list = await res.json();
    expect(Array.isArray(list) && list.length > 0).toBeTruthy();
    const first = list[0];
    await api.dispose();

    const response = await page.goto(`/studio/autocad/${first.id}`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);

    // The AutoCAD page renders the plan inside an SVG element. Wait for
    // it (not just for DOM ready) so we know hydration completed.
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 15_000 });

    // The page chrome should mention either the intersection name or
    // its code so we know the right record loaded.
    const body = page.locator("body");
    await expect
      .poll(async () => (await body.innerText()).toLowerCase(), {
        timeout: 15_000,
      })
      .toContain((first.code ?? first.name ?? "").toLowerCase().slice(0, 6));
  });

  test("the toolbar exposes the dossier export buttons (smoke for the new PDF layers)", async ({
    page,
  }) => {
    const api = await request.newContext();
    const list = await (
      await api.get(`${BACKEND_URL}/engineering/intersections`)
    ).json();
    await api.dispose();
    await page.goto(`/studio/autocad/${list[0].id}`, {
      waitUntil: "domcontentloaded",
    });

    // Buttons we ship today on the AutoCAD toolbar.
    await expect(
      page.getByRole("button", { name: /export dossier r[ée]gulation/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /export dossier c[âa]blage/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /export plan pdf/i }),
    ).toBeVisible();
  });
});
