/**
 * Capture screenshots of the STLS frontend for the project deck.
 * Drives http://localhost:3000 with Playwright + Chromium.
 *
 * Usage:
 *   node capture.js [--base http://localhost:3000] [--out ../../docs/deck-shots]
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const args = parseArgs(process.argv.slice(2));
const BASE = args.base || "http://localhost:3000";
const OUT = path.resolve(args.out || path.join(__dirname, "..", "..", "docs", "deck-shots"));
const VIEWPORT = { width: 1600, height: 1000 };
const SETTLE = 350;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

async function settle(page, ms = SETTLE) {
  await page.waitForTimeout(ms);
}

async function shoot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("  ✓", path.basename(file));
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    window.localStorage.setItem("stls.studio.theme", t);
  }, theme);
}

async function clearSession(page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("stls.studio.session");
  });
}

async function gotoStudio(page) {
  await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=STLS Studio", { timeout: 15000 });
  await settle(page, 500);
}

async function openFirstIntersection(page) {
  // Expand explorer down to a leaf intersection node.  The seeded data
  // exposes Casablanca-Settat → Casablanca → INT-CAS-001 by default.
  // Click the first "intersection" leaf we can find.
  await page.waitForSelector("button:has-text('Casablanca')", { timeout: 10000 });
  // Make sure the city is expanded; clicking the button toggles it.
  // The city row appears as a button; click it once to ensure it's open.
  const intersectionLeafSelector =
    "aside button:has(span.text-info-ink)"; // intersection icon uses text-info-ink
  let leaves = await page.$$(intersectionLeafSelector);
  if (leaves.length === 0) {
    // Try expanding the casablanca-settat region first
    const region = await page.$("button:has-text('Casablanca-Settat')");
    if (region) await region.click();
    await settle(page);
    const city = await page.$("button:has-text('Casablanca')");
    if (city) await city.click();
    await settle(page);
    leaves = await page.$$(intersectionLeafSelector);
  }
  if (leaves.length === 0) {
    throw new Error("No intersection leaf found in project explorer");
  }
  await leaves[0].click();
  await settle(page, 700);
}

async function clickEditorTab(page, label) {
  // Editor section tab strip — buttons with the section labels.
  const tab = await page.locator(`button[type="button"]:has-text("${label}")`).first();
  await tab.click();
  await settle(page, 600);
}

async function clickModeTab(page, label) {
  const tab = await page.locator(`[role="tablist"] button[role="tab"]:has-text("${label}")`).first();
  await tab.click();
  await settle(page, 700);
}

async function captureFlow() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log("→ Output:", OUT);
  console.log("→ Base:  ", BASE);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1.5,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  // ────────────────────────── Operations dashboard
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  await shoot(page, "01-operations-dashboard");

  // ────────────────────────── Studio splash
  await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=STLS Studio", { timeout: 15000 });
  await clearSession(page);
  await setTheme(page, "dark");
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page, 800);
  await shoot(page, "02-studio-splash-dark");

  // Open intersection
  await openFirstIntersection(page);
  await shoot(page, "03-engineering-diagram-dark");

  // Walk through engineering sections
  const sections = [
    ["Identity", "04-engineering-identity"],
    ["Approaches", "05-engineering-approaches"],
    ["Signal groups", "06-engineering-signal-groups"],
    ["Phases & Stages", "07-engineering-phases-stages"],
    ["Detectors", "08-engineering-detectors"],
    ["Controller", "09-engineering-controller"],
    ["Live", "10-engineering-live-schematic"],
  ];
  for (const [label, name] of sections) {
    try {
      await clickEditorTab(page, label);
      await shoot(page, name);
    } catch (err) {
      console.warn(`  ! could not capture ${label}: ${err.message}`);
    }
  }

  // Back to Diagram, toggle conflicts.  Use the stable `title` attribute
  // so we hit the same button after its text changes to "Conflicts ON".
  await clickEditorTab(page, "Diagram");
  const engConflict = page.locator(
    'button[title="Toggle visualization of all incompatibility pairs"]',
  );
  if (await engConflict.count()) {
    await engConflict.click();
    await settle(page, 500);
    await shoot(page, "11-engineering-conflicts-overlay");
    await engConflict.click();
    await settle(page, 300);
  }

  // ────────────────────────── Control mode (dark)
  await clickModeTab(page, "Control");
  await settle(page, 800);
  await shoot(page, "12-control-mode-dark");

  const ctrlConflict = page.locator(
    'button[title="Toggle all-conflict overlay"]',
  );
  if (await ctrlConflict.count()) {
    await ctrlConflict.click();
    await settle(page, 500);
    await shoot(page, "13-control-mode-conflicts");
    await ctrlConflict.click();
    await settle(page, 300);
  }

  // ────────────────────────── Light theme captures
  await setTheme(page, "light");
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page, 900);
  // Re-open intersection in case session restore lands on splash
  try {
    await page.waitForSelector("text=Operator console", { timeout: 4000 });
  } catch {
    await openFirstIntersection(page);
    await clickModeTab(page, "Control");
    await settle(page, 700);
  }
  await shoot(page, "14-control-mode-light");

  // Engineering light view too
  await clickModeTab(page, "Engineering");
  await clickEditorTab(page, "Diagram");
  await settle(page, 500);
  await shoot(page, "15-engineering-diagram-light");

  await browser.close();
  console.log("\n✓ Done. Captured", fs.readdirSync(OUT).length, "files.");
}

captureFlow().catch((err) => {
  console.error("✗ Capture failed:", err);
  process.exit(1);
});
