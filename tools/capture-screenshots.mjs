/**
 * Capture PNG screenshots of every STLS interface the deck references.
 *
 *   npm --prefix tools install
 *   node tools/capture-screenshots.mjs
 *
 * Output : tools/captures/<slug>.png   (1600×900, light theme)
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import puppeteer from "puppeteer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "tools", "captures");
mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = process.env.STLS_FRONTEND_URL ?? "http://127.0.0.1:3001";
const INTERSECTION_ID = process.env.STLS_INTERSECTION_ID ?? "e0b61607-e47d-4914-8739-b51c2e5bb699";
const CONTROLLER_ID = process.env.STLS_CONTROLLER_ID ?? "45436bcb-0a5e-499b-b2aa-a7700e8ac2db";

// Define the captures to take. Each route gets a readable slug which
// the deck generator will look up by name when embedding images.
const targets = [
  {
    slug: "command-platform",
    url: "/",
    wait: 6000,
    // Accept cookie banners / iframes if Google throws any. A generous
    // timeout lets the Morocco map and tile layer fully render.
  },
  { slug: "projects", url: "/projects", wait: 2500 },
  { slug: "studio-landing", url: "/studio", wait: 6000 },
  { slug: "studio-zones", url: "/studio/zones", wait: 6000 },
  {
    slug: "controller-workspace",
    url: `/studio/controllers/${CONTROLLER_ID}`,
    wait: 3500,
  },
  {
    slug: "autocad-plan",
    url: `/studio/autocad/${INTERSECTION_ID}`,
    wait: 2500,
  },
  {
    slug: "autocad-dossier-regulation",
    url: `/studio/autocad/${INTERSECTION_ID}/dossier/regulation`,
    wait: 2000,
  },
  {
    slug: "autocad-dossier-cablage",
    url: `/studio/autocad/${INTERSECTION_ID}/dossier/cablage`,
    wait: 2000,
  },
  { slug: "studio-workbench", url: "/studio/workbench", wait: 3500 },
  { slug: "engineering", url: "/engineering", wait: 3500 },
  {
    slug: "engineering-intersection",
    url: `/engineering/intersections/${INTERSECTION_ID}`,
    wait: 3500,
  },
  {
    slug: "engineering-controllers",
    url: "/engineering/controllers",
    wait: 3500,
  },
];

console.log(`Capturing ${targets.length} routes from ${BASE_URL} → ${OUT_DIR}`);
const browser = await puppeteer.launch({
  headless: "new",
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const target of targets) {
    const out = path.join(OUT_DIR, `${target.slug}.png`);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    page.on("pageerror", (err) => {
      console.log(`  [${target.slug}] page error:`, err.message.slice(0, 120));
    });
    try {
      console.log(`  → ${target.url}`);
      await page.goto(`${BASE_URL}${target.url}`, { waitUntil: "networkidle2" });
      // Give React-rendered chrome (Google Maps tiles, client fetches)
      // a deterministic window to settle.
      await new Promise((resolve) => setTimeout(resolve, target.wait));
      await page.screenshot({ path: out, fullPage: false });
      console.log(`     saved → ${path.basename(out)}`);
    } catch (error) {
      console.log(`     FAILED: ${error instanceof Error ? error.message : error}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

// Print a manifest so the deck generator knows what exists.
const manifest = targets
  .map((t) => {
    const file = path.join(OUT_DIR, `${t.slug}.png`);
    return existsSync(file) ? t.slug : null;
  })
  .filter(Boolean);
console.log(`\nCaptures written: ${manifest.join(", ")}`);
