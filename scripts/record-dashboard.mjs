/**
 * STLS — automated full-project tester recording.
 *
 * Drives a real Chromium browser through the dashboard like a human
 * tester: light theme, slow paced, every important screen visited,
 * mouse movements visible. Output: a webm video that we then convert
 * to mp4 on the Desktop.
 *
 * Run: node scripts/record-dashboard.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("scripts/.recordings");
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 1600, height: 900 };
const URL = "http://localhost:3000";

// Slow, deliberate pacing so a human watching can read each screen.
const PACE = {
  shortBeat: 1500,
  read: 3500,
  examine: 5500,
  fullPage: 7000,
};

async function pause(page, ms, label) {
  if (label) console.log(`  · [${ms.toString().padStart(4, " ")} ms] ${label}`);
  await page.waitForTimeout(ms);
}

async function moveCursorTo(page, locator) {
  try {
    const box = await locator.boundingBox();
    if (!box) return;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Smooth move from current position with intermediate steps so the
    // cursor is visible in the recording.
    await page.mouse.move(cx, cy, { steps: 18 });
  } catch {
    /* ignore */
  }
}

async function safeClick(page, label, selector) {
  const target = page.locator(selector).first();
  if (!(await target.count())) {
    console.log(`    ⚠ not found: ${label}  (${selector})`);
    return false;
  }
  try {
    await target.scrollIntoViewIfNeeded();
  } catch {
    /* ignore */
  }
  await moveCursorTo(page, target);
  await page.waitForTimeout(700);
  await target.click({ delay: 120 }).catch(() => {});
  console.log(`    → clicked: ${label}`);
  return true;
}

async function safeHover(page, label, selector) {
  const target = page.locator(selector).first();
  if (!(await target.count())) return false;
  await moveCursorTo(page, target);
  console.log(`    ↳ hovered: ${label}`);
  return true;
}

async function navigate(page, path, label) {
  console.log(`Navigate → ${path}`);
  await page.goto(`${URL}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await pause(page, PACE.fullPage, `${label}: rendered`);
}

(async () => {
  console.log("Launching Chromium…");
  const browser = await chromium.launch({ headless: true });

  // Pre-set the theme to LIGHT before any page loads. The frontend
  // reads window.localStorage["stls.command.theme"] on mount.
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("stls.command.theme", "light");
    } catch {
      /* ignore */
    }
  });

  const page = await context.newPage();
  page.on("pageerror", (err) =>
    console.log(`    [pageerror] ${err.message.slice(0, 140)}`),
  );

  // ── 1. Open the dashboard ──
  console.log("Opening dashboard…");
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await pause(page, PACE.fullPage, "Dashboard initial load (light theme)");

  // ── 2. Hover & explore the country-level metrics ──
  await safeHover(page, "Active incidents card", 'text=ACTIVE INCIDENTS');
  await pause(page, PACE.read, "Reading: incidents, controllers, throughput");

  await safeHover(page, "Network card", 'text=/^NETWORK$/');
  await pause(page, PACE.read, "Reading: 170 nodes");

  await safeHover(page, "Throughput card", 'text=THROUGHPUT');
  await pause(page, PACE.read, "Reading: 2600 vph");

  // ── 3. Toggle to DARK to demonstrate theme support ──
  await safeClick(page, "Theme toggle (→ dark)", 'button[role="switch"]');
  await pause(page, PACE.examine, "Dark theme demonstration");

  // ── 4. Back to LIGHT for the rest of the test ──
  await safeClick(page, "Theme toggle (→ light)", 'button[role="switch"]');
  await pause(page, PACE.read, "Back to light theme");

  // ── 5. Switch surface to "Graphe contrôleurs" ──
  await safeClick(
    page,
    "Graphe contrôleurs tab",
    'button:has-text("Graphe contrôleurs")',
  );
  await pause(page, PACE.fullPage, "Graphe contrôleurs (city picker overlay)");

  // ── 6. Pick Casablanca to see the city-scoped graph ──
  await safeClick(page, "Pick Casablanca", 'button:has-text("Casablanca")');
  await pause(page, PACE.fullPage, "Casablanca controller graph");
  await pause(page, PACE.examine, "Animated background + traffic particles");

  // ── 7. Try the "Géométrie" layout ──
  await safeClick(page, "Géométrie layout", 'button:has-text("Géométrie")');
  await pause(page, PACE.examine, "Géométrie / geo-spatial layout");

  // ── 8. Back to "Relation" layout ──
  await safeClick(page, "Relation layout", 'button:has-text("Relation")');
  await pause(page, PACE.read, "Relation layout");

  // ── 9. Back to Carte trafic ──
  await safeClick(page, "Carte trafic tab", 'button:has-text("Carte trafic")');
  await pause(page, PACE.examine, "Map view (Casablanca city scope)");

  // ── 10. Try a different city via the picker (graph + city) ──
  await safeClick(
    page,
    "Graphe contrôleurs tab again",
    'button:has-text("Graphe contrôleurs")',
  );
  await pause(page, PACE.read, "Graph picker re-opened? (or cached city)");

  // ── 11. Studio / network ──
  await navigate(page, "/studio/network", "Studio · Network");
  await pause(page, PACE.examine, "Network workspace");

  // ── 12. Studio / workbench ──
  await navigate(page, "/studio/workbench", "Studio · Workbench");
  await pause(page, PACE.examine, "Engineering workbench");

  // ── 13. Studio / corridors ──
  await navigate(page, "/studio/corridors", "Studio · Corridors");
  await pause(page, PACE.examine, "Corridor coordination");

  // ── 14. Studio / zones ──
  await navigate(page, "/studio/zones", "Studio · Zones");
  await pause(page, PACE.examine, "Zone management");

  // ── 15. Engineering top page ──
  await navigate(page, "/engineering", "Engineering");
  await pause(page, PACE.examine, "Engineering catalog");

  // ── 16. Projects ──
  await navigate(page, "/projects", "Projects");
  await pause(page, PACE.examine, "Projects list");

  // ── 17. Back to dashboard for the closing shot ──
  await navigate(page, "/", "Dashboard (closing)");
  await pause(page, PACE.fullPage, "Final overview shot");

  console.log("Closing context (writing video)…");
  await context.close();
  await browser.close();

  const fs = await import("node:fs/promises");
  const files = (await fs.readdir(OUT_DIR)).filter((f) => f.endsWith(".webm"));
  files.sort();
  if (!files.length) {
    console.error("No video produced.");
    process.exit(1);
  }
  const latest = resolve(OUT_DIR, files[files.length - 1]);
  console.log(`\nRecorded: ${latest}`);
})();
