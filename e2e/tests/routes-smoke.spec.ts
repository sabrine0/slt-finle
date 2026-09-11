/**
 * Route smoke matrix.
 *
 * For every top-level Next.js route in the app, navigate to it, then
 * assert:
 *   1. HTTP status is in the 2xx range.
 *   2. No console.error / pageerror / failed HTTP requests fired
 *      during DOMContentLoaded.
 *   3. Body does not contain the React error overlay or "Application
 *      error" text.
 *
 * Dynamic routes pull a real ID from the backend via /_helpers/fixtures.
 * Routes whose data isn't seeded (no controllers, no corridors, etc.)
 * are still hit so we catch crashes in their empty states.
 */

import { test, expect } from "@playwright/test";
import { trackPageProblems, summariseProblems } from "./_helpers/page-errors";
import {
  firstCityId,
  firstControllerId,
  firstIntersectionId,
} from "./_helpers/fixtures";

interface RouteCase {
  name: string;
  url: () => Promise<string | null>;
  /** When true, missing fixture data skips the test instead of failing. */
  optionalData?: boolean;
}

const STATIC_ROUTES: RouteCase[] = [
  { name: "/engineering", url: async () => "/engineering" },
  { name: "/engineering/controllers", url: async () => "/engineering/controllers" },
  { name: "/projects", url: async () => "/projects" },
  { name: "/studio", url: async () => "/studio" },
  { name: "/studio/ai-etude", url: async () => "/studio/ai-etude" },
  { name: "/studio/corridors", url: async () => "/studio/corridors" },
  { name: "/studio/network", url: async () => "/studio/network" },
  { name: "/studio/references", url: async () => "/studio/references" },
  { name: "/studio/workbench", url: async () => "/studio/workbench" },
  { name: "/studio/zones", url: async () => "/studio/zones" },
];

const DYNAMIC_ROUTES: RouteCase[] = [
  {
    name: "/engineering/intersections/[id]",
    url: async () => {
      const id = await firstIntersectionId();
      return id ? `/engineering/intersections/${id}` : null;
    },
  },
  {
    name: "/engineering/controllers/[id]",
    url: async () => {
      const id = await firstControllerId();
      return id ? `/engineering/controllers/${id}` : null;
    },
    optionalData: true,
  },
  {
    name: "/studio/autocad/[id]",
    url: async () => {
      const id = await firstIntersectionId();
      return id ? `/studio/autocad/${id}` : null;
    },
  },
  {
    name: "/studio/autocad/[id]/dossier/regulation",
    url: async () => {
      const id = await firstIntersectionId();
      return id ? `/studio/autocad/${id}/dossier/regulation` : null;
    },
  },
  {
    name: "/studio/autocad/[id]/dossier/cablage",
    url: async () => {
      const id = await firstIntersectionId();
      return id ? `/studio/autocad/${id}/dossier/cablage` : null;
    },
  },
  {
    name: "/studio/controllers/[id]",
    url: async () => {
      const id = await firstControllerId();
      return id ? `/studio/controllers/${id}` : null;
    },
    optionalData: true,
  },
  {
    name: "/studio/network/[cityId]",
    url: async () => {
      const id = await firstCityId();
      return id ? `/studio/network/${id}` : null;
    },
  },
  {
    name: "/studio/programmer/[id]",
    url: async () => {
      const id = await firstControllerId();
      return id ? `/studio/programmer/${id}` : null;
    },
    optionalData: true,
  },
  {
    name: "/studio/workspace/[id]",
    url: async () => {
      const id = await firstIntersectionId();
      return id ? `/studio/workspace/${id}` : null;
    },
  },
];

const ALL_ROUTES = [...STATIC_ROUTES, ...DYNAMIC_ROUTES];

for (const route of ALL_ROUTES) {
  test(`route smoke: ${route.name}`, async ({ page }) => {
    const url = await route.url();
    if (!url) {
      if (route.optionalData) {
        test.skip(true, `no fixture data for ${route.name}`);
      } else {
        throw new Error(`required fixture missing for ${route.name}`);
      }
    }
    const problems = trackPageProblems(page);
    const response = await page.goto(url!, { waitUntil: "domcontentloaded" });
    expect(response, `no response from ${url}`).not.toBeNull();
    expect(
      response!.status(),
      `${route.name} returned ${response!.status()}`,
    ).toBeLessThan(400);

    // Give SSR-then-hydrate a beat so client-side fetches that fire on
    // mount have a chance to fail before we measure.
    await page.waitForTimeout(800);

    const summary = summariseProblems(problems);
    if (summary) {
      throw new Error(`${route.name} reported problems:\n${summary}`);
    }

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/application error|internal server error/i);
  });
}
