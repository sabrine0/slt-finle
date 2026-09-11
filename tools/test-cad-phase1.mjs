import puppeteer from "../tools/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js";

const URL =
  "http://localhost:3000/studio/autocad/b28143ec-060f-455f-bb61-eb9a5a646970";

const browser = await puppeteer.launch({
  headless: "new",
  defaultViewport: { width: 1900, height: 1100, deviceScaleFactor: 1 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();

const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    if (!/hydrat/i.test(t)) errs.push("CONSOLE " + t.slice(0, 200));
  }
});

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

// Toggle edit
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /^✎ Edit/.test((b.textContent || "").trim()),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 600));

// Confirm Reset view button + status bar exist
const initial = await page.evaluate(() => {
  const reset = Array.from(document.querySelectorAll("button")).find((b) =>
    /Reset view/i.test((b.textContent || "").trim()),
  );
  // Status bar text begins "X — Y — m" before the cursor enters
  const status = Array.from(document.querySelectorAll("span")).find((s) =>
    /^X\s/.test((s.textContent || "").trim()),
  );
  return {
    resetBtn: reset ? reset.textContent.trim() : null,
    resetDisabled: reset ? reset.disabled : null,
    statusVisible: !!status,
    statusText: status ? (status.textContent || "").trim().slice(0, 80) : null,
  };
});
console.log("Initial:", initial);

// Move cursor over the canvas → status bar X/Y should update
const svg = await page.$("svg");
const box = await svg.boundingBox();
const centerX = box.x + box.width / 2;
const centerY = box.y + box.height / 2;
await page.mouse.move(centerX + 100, centerY - 50);
await new Promise((r) => setTimeout(r, 200));

const afterMove = await page.evaluate(() => {
  const status = Array.from(document.querySelectorAll("span")).find((s) =>
    /^X\s/.test((s.textContent || "").trim()),
  );
  return status ? (status.textContent || "").trim() : null;
});
console.log("After mouse move:", afterMove);

// Wheel zoom in (deltaY < 0 should zoom in, increasing zoom %)
await page.mouse.move(centerX, centerY);
await page.mouse.wheel({ deltaY: -300 });
await new Promise((r) => setTimeout(r, 200));
await page.mouse.wheel({ deltaY: -300 });
await new Promise((r) => setTimeout(r, 200));

const afterZoom = await page.evaluate(() => {
  const zoomEl = Array.from(document.querySelectorAll("span")).find((s) =>
    /^Zoom/.test((s.textContent || "").trim()),
  );
  const reset = Array.from(document.querySelectorAll("button")).find((b) =>
    /Reset view/i.test((b.textContent || "").trim()),
  );
  return {
    zoomText: zoomEl ? (zoomEl.textContent || "").trim() : null,
    resetEnabled: reset ? !reset.disabled : null,
  };
});
console.log("After wheel zoom in:", afterZoom);

// Middle-button pan
await page.mouse.move(centerX, centerY);
await page.mouse.down({ button: "middle" });
await page.mouse.move(centerX + 200, centerY + 100, { steps: 10 });
await page.mouse.up({ button: "middle" });
await new Promise((r) => setTimeout(r, 200));

const afterPan = await page.evaluate(() => {
  const reset = Array.from(document.querySelectorAll("button")).find((b) =>
    /Reset view/i.test((b.textContent || "").trim()),
  );
  // Did viewBox change?  Read it directly.
  const svg = document.querySelector("svg");
  return {
    viewBox: svg?.getAttribute("viewBox") ?? null,
    resetEnabled: reset ? !reset.disabled : null,
  };
});
console.log("After middle-button pan:", afterPan);

// Reset view
await page.evaluate(() => {
  const reset = Array.from(document.querySelectorAll("button")).find((b) =>
    /Reset view/i.test((b.textContent || "").trim()),
  );
  reset?.click();
});
await new Promise((r) => setTimeout(r, 300));

const afterReset = await page.evaluate(() => {
  const reset = Array.from(document.querySelectorAll("button")).find((b) =>
    /Reset view/i.test((b.textContent || "").trim()),
  );
  const zoomEl = Array.from(document.querySelectorAll("span")).find((s) =>
    /^Zoom/.test((s.textContent || "").trim()),
  );
  return {
    zoomText: zoomEl ? (zoomEl.textContent || "").trim() : null,
    resetDisabled: reset ? reset.disabled : null,
  };
});
console.log("After Reset view:", afterReset);

// Crosshair lines should exist (2 long lines outside planTransform g)
const crosshair = await page.evaluate(() => {
  // Move cursor first so onPointerMove fires
  const svg = document.querySelector("svg");
  const lines = Array.from(svg?.querySelectorAll("line") || []);
  // Crosshair lines are dashed and span the full viewBox.
  const dashed = lines.filter(
    (l) => (l.getAttribute("stroke-dasharray") || "").length > 0,
  );
  return { dashedLineCount: dashed.length };
});
// Not all dashed lines are crosshair — there are also lane marks etc.
console.log("Dashed lines (incl. lane marks):", crosshair);

await page.screenshot({ path: "./tools/captures/cad-phase1.png" });

console.log("\nErrors:", errs.length);
errs.slice(0, 6).forEach((e) => console.log(" -", e.slice(0, 200)));

await browser.close();
