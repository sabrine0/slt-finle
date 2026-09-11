/**
 * Capture the routes added since the original capture script.
 *
 *   $env:STLS_FRONTEND_URL = "http://127.0.0.1:3000"
 *   node tools/capture-new.mjs
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "tools", "captures");
mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.STLS_FRONTEND_URL ?? "http://127.0.0.1:3000";

const targets = [
  { slug: "ai-etude",        url: "/studio/ai-etude",   wait: 4500 },
  { slug: "references",      url: "/studio/references", wait: 3000 },
  { slug: "network",         url: "/studio/network",    wait: 4500 },
  { slug: "corridors",       url: "/studio/corridors",  wait: 4000 },
  // Refresh the ones we already use too, to make them current.
  { slug: "command-platform", url: "/",                  wait: 6000 },
  { slug: "projects",         url: "/projects",          wait: 2500 },
  { slug: "studio-landing",   url: "/studio",            wait: 6000 },
  { slug: "studio-workbench", url: "/studio/workbench",  wait: 3500 },
  { slug: "studio-zones",     url: "/studio/zones",      wait: 6000 },
  { slug: "engineering",      url: "/engineering",       wait: 3500 },
];

console.log(`Capturing ${targets.length} routes from ${BASE} → ${OUT_DIR}`);
const browser = await puppeteer.launch({
  headless: "new",
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
try {
  for (const t of targets) {
    const out = path.join(OUT_DIR, `${t.slug}.png`);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    try {
      console.log(`  → ${t.url}`);
      await page.goto(`${BASE}${t.url}`, { waitUntil: "networkidle2" });
      await new Promise(r => setTimeout(r, t.wait));
      await page.screenshot({ path: out, fullPage: false });
      console.log(`     saved ${t.slug}.png`);
    } catch (err) {
      console.log(`     FAILED ${t.slug}: ${(err.message ?? err).toString().slice(0, 100)}`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
console.log("done");
