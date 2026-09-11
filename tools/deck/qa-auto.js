/**
 * AUTO-mode QA validation.  Drives the live dev server with
 * Playwright and exercises every safety rule from the spec.
 *
 * Usage:
 *   node qa-auto.js [--base http://localhost:3000] [--api http://localhost:4010]
 */

const { chromium } = require("playwright");

const args = parse(process.argv.slice(2));
const BASE = args.base || "http://localhost:3000";
const API  = args.api  || "http://localhost:4010";
const TARGET_INT = args.intersection || "INT-CAS-001";

function parse(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[k] = v;
    }
  }
  return out;
}

const results = { pass: [], fail: [], consoleErrors: [], pageErrors: [] };
function pass(m) { results.pass.push(m); console.log("  ✓", m); }
function fail(m) { results.fail.push(m); console.log("  ✗", m); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function fetchState() {
  const res = await fetch(`${API}/intersections/${TARGET_INT}/state`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`runtime state ${res.status}`);
  return await res.json();
}

async function reset() {
  await api("POST", `/intersections/${TARGET_INT}/phase`, { phaseId: null });
  await api("POST", `/command-platform/intersections/${TARGET_INT}/force-green`, { direction: null });
  await api("POST", `/command-platform/intersections/${TARGET_INT}/mode`, { mode: "adaptive" });
  await api("POST", `/command-platform/intersections/${TARGET_INT}/override`, { engaged: false });
}

async function openControl(page) {
  await page.evaluate(({ id, label }) => {
    window.localStorage.setItem("stls.studio.session", JSON.stringify({
      mode: "control",
      tabs: [{
        id: `tab-intersection-${id}`,
        kind: "intersection",
        label,
        intersectionId: id,
        closable: true,
      }],
      activeTabId: `tab-intersection-${id}`,
    }));
  }, { id: TARGET_INT, label: "Maarif / Zerktouni" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Operator console", { timeout: 10000 });
  await sleep(700);
}

async function setAuto(page, on) {
  // Banner toggle: two role=tab buttons inside the AUTO card.  Find
  // the pair scoped to "Auto control" rail section and click the right
  // one.
  const target = on ? "Auto" : "Manual";
  const btn = page.locator(
    `[role="tablist"][aria-label="Auto / Manual"] button:has-text("${target}")`,
  ).first();
  await btn.click();
  await sleep(300);
}

async function autoStatusText(page) {
  // The status copy line lives directly under the toggle in the
  // Auto control card.  Grab the surrounding card's text.
  const txt = await page.locator(
    `[role="tablist"][aria-label="Auto / Manual"]`,
  ).first().locator("xpath=ancestor::section[1]").innerText();
  return txt.toLowerCase();
}

(async () => {
  console.log("→ AUTO QA harness");
  console.log("  base:", BASE);
  console.log("  api :", API);

  await reset();
  let pre = await fetchState();
  pass(`Runtime ready · phase=${pre.activePhaseId} state=${pre.phaseState} cycle=${pre.cycleSeconds}s`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") results.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => results.pageErrors.push(err.message));

  await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=STLS Studio", { timeout: 15000 });
  await openControl(page);

  // ──────────────── 1. Initial state: Manual selected
  console.log("\n[Toggle initial state]");
  const manualSel = await page.locator(
    `[role="tablist"][aria-label="Auto / Manual"] button:has-text("Manual")`,
  ).first().getAttribute("aria-selected");
  if (manualSel === "true") pass("Default = Manual");
  else fail(`Manual aria-selected = ${manualSel}, expected true`);

  // ──────────────── 2. Toggle Manual → Auto → Manual
  console.log("\n[Toggle Manual ↔ Auto]");
  await setAuto(page, true);
  const autoSel = await page.locator(
    `[role="tablist"][aria-label="Auto / Manual"] button:has-text("Auto")`,
  ).first().getAttribute("aria-selected");
  if (autoSel === "true") pass("Toggle → AUTO works");
  else fail("Toggle → AUTO did not flip aria-selected");

  await setAuto(page, false);
  const manualSel2 = await page.locator(
    `[role="tablist"][aria-label="Auto / Manual"] button:has-text("Manual")`,
  ).first().getAttribute("aria-selected");
  if (manualSel2 === "true") pass("Toggle → MANUAL works");
  else fail("Toggle → MANUAL did not flip aria-selected");

  // ──────────────── 3. AUTO actually dispatches a force-phase
  // We look at the runtime's commands.forcedPhaseId before/after.
  console.log("\n[AUTO dispatches a force-phase]");
  await reset();
  await sleep(400);
  const before = await fetchState();
  await setAuto(page, true);
  // Min-green for ph-1 / ph-2 in the seed is 10s.  The hook fires
  // immediately + every 2s; first dispatch happens once min-green
  // for the active phase elapses.  We poll up to 22s.
  const deadline = Date.now() + 22000;
  let dispatched = null;
  while (Date.now() < deadline) {
    await sleep(1000);
    const s = await fetchState();
    if (s.commands.forcedPhaseId !== null) {
      dispatched = s.commands.forcedPhaseId;
      break;
    }
  }
  if (dispatched) {
    pass(`AUTO dispatched force-phase → ${dispatched} (started from active=${before.activePhaseId})`);
  } else {
    fail("AUTO did not dispatch within 22s — check min-green / recommendation");
  }

  // ──────────────── 4. AUTO pauses on operator override
  console.log("\n[AUTO pauses when manualOverride is engaged]");
  // Engage override via API (operator action)
  await api("POST", `/command-platform/intersections/${TARGET_INT}/override`, { engaged: true });
  await sleep(2500);
  let bannerTxt = await autoStatusText(page);
  if (/paused.*operator/.test(bannerTxt)) {
    pass("Banner shows 'Paused — operator is in control'");
  } else {
    fail(`Banner text unexpected after override: ${bannerTxt.slice(0, 200)}`);
  }
  // Verify no NEW dispatch happens during a 4s window
  const overrideStart = await fetchState();
  await sleep(4000);
  const overrideEnd = await fetchState();
  if (overrideEnd.commands.forcedPhaseId === overrideStart.commands.forcedPhaseId) {
    pass("AUTO did not dispatch while operator override engaged");
  } else {
    fail(`AUTO dispatched during override: ${overrideStart.commands.forcedPhaseId} → ${overrideEnd.commands.forcedPhaseId}`);
  }
  // Release override
  await api("POST", `/command-platform/intersections/${TARGET_INT}/override`, { engaged: false });
  await sleep(2500);
  bannerTxt = await autoStatusText(page);
  if (/engine driving|holding current phase|waiting/.test(bannerTxt)) {
    pass("Banner returns to driving / waiting after release");
  } else {
    fail(`Banner did not return to driving: ${bannerTxt.slice(0, 200)}`);
  }

  // ──────────────── 5. AUTO pauses on emergency mode
  console.log("\n[AUTO pauses under emergency mode]");
  await api("POST", `/command-platform/intersections/${TARGET_INT}/mode`,
    { mode: "emergency", confirmed: true });
  await sleep(2500);
  bannerTxt = await autoStatusText(page);
  if (/paused.*special runtime mode|paused.*emergency/.test(bannerTxt)) {
    pass("Banner shows 'Paused — special runtime mode active'");
  } else {
    fail(`Banner did not show emergency pause: ${bannerTxt.slice(0, 200)}`);
  }
  const emStart = await fetchState();
  await sleep(4000);
  const emEnd = await fetchState();
  // Under emergency, forcedPhaseId is cleared by backend.  We just
  // verify AUTO doesn't try to push a new force during this window
  // (which would also be rejected with 400 anyway — no spam).
  if (emEnd.commands.forcedPhaseId === emStart.commands.forcedPhaseId) {
    pass("AUTO did not dispatch during emergency mode");
  } else {
    fail(`AUTO dispatched during emergency: ${emStart.commands.forcedPhaseId} → ${emEnd.commands.forcedPhaseId}`);
  }
  await api("POST", `/command-platform/intersections/${TARGET_INT}/mode`, { mode: "adaptive" });
  await sleep(1000);

  // ──────────────── 6. AUTO toggle → MANUAL stops dispatching
  console.log("\n[Toggle MANUAL stops AUTO loop]");
  await setAuto(page, false);
  await sleep(700);
  const stopStart = await fetchState();
  await sleep(5000);
  const stopEnd = await fetchState();
  if (stopEnd.commands.forcedPhaseId === stopStart.commands.forcedPhaseId) {
    pass("After MANUAL toggle, AUTO emits no further dispatches");
  } else {
    fail(`AUTO still dispatching after MANUAL: ${stopStart.commands.forcedPhaseId} → ${stopEnd.commands.forcedPhaseId}`);
  }

  // ──────────────── 7. Final cleanup
  await reset();
  const finalState = await fetchState();
  if (
    finalState.commands.forcedPhaseId === null &&
    finalState.commands.forcedDirection === null &&
    finalState.commands.manualOverride === false
  ) {
    pass("Final cleanup OK — no leftover overrides");
  } else {
    fail(`Final state has leftover overrides: ${JSON.stringify(finalState.commands)}`);
  }

  await browser.close();

  console.log("\n──────────── AUTO SUMMARY ────────────");
  console.log("PASSED:", results.pass.length);
  console.log("FAILED:", results.fail.length);
  console.log("Console errors:", results.consoleErrors.length);
  console.log("Page errors   :", results.pageErrors.length);
  if (results.consoleErrors.length) {
    console.log("\n-- Console errors --");
    results.consoleErrors.forEach((e, i) =>
      console.log(`  [${i + 1}] ${e.slice(0, 220)}`),
    );
  }
  if (results.pageErrors.length) {
    console.log("\n-- Page errors --");
    results.pageErrors.forEach((e, i) =>
      console.log(`  [${i + 1}] ${e.slice(0, 220)}`),
    );
  }
  if (results.fail.length) {
    console.log("\n-- FAILURES --");
    results.fail.forEach((e, i) => console.log(`  [${i + 1}] ${e}`));
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error("✗ harness crashed:", err);
  process.exit(2);
});
