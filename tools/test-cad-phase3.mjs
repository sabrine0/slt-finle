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
    if (!/hydrat|preventDefault inside passive/i.test(t)) {
      errs.push("CONSOLE " + t.slice(0, 250));
    }
  }
});

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

// Toggle edit
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent || "").trim() === "✎ Edit",
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 500));

// Verify snap toggles exist
const snapChips = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("button"))
    .map((b) => (b.textContent || "").trim())
    .filter((t) => /Grid \(F9\)|OSnap|Ortho \(F8\)/i.test(t));
});
console.log("Snap toggles in toolbar:", snapChips);

// Pick the first grabbable entity, click it to select, then read its X/Y
await page.evaluate(() => {
  const svg = document.querySelector("svg");
  const grabbable = Array.from(svg.querySelectorAll("g")).filter(
    (g) =>
      /grab/.test(g.getAttribute("style") || "") || g.style.cursor === "grab",
  );
  grabbable[0].setAttribute("data-test-pick", "1");
});
const before = await page.evaluate(() => {
  const el = document.querySelector('[data-test-pick="1"]');
  const r = el.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});

// Click to select
await page.mouse.move(before.cx, before.cy);
await page.mouse.down();
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));

const initialPos = await page.evaluate(() => {
  const xInput = Array.from(document.querySelectorAll("label"))
    .find((l) => /X \(m\)/.test((l.textContent || "").trim()))
    ?.querySelector("input");
  const yInput = Array.from(document.querySelectorAll("label"))
    .find((l) => /Y \(m\)/.test((l.textContent || "").trim()))
    ?.querySelector("input");
  return { x: xInput?.value, y: yInput?.value };
});
console.log("Initial selected entity pos:", initialPos);

// Drag the entity by ~17 px in X (a non-integer-metres delta) and read
// the new position — with grid snap it should be an integer.
await page.mouse.move(before.cx, before.cy);
await page.mouse.down();
await page.mouse.move(before.cx + 17, before.cy + 7, { steps: 10 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));

const afterDrag = await page.evaluate(() => {
  const xInput = Array.from(document.querySelectorAll("label"))
    .find((l) => /X \(m\)/.test((l.textContent || "").trim()))
    ?.querySelector("input");
  const yInput = Array.from(document.querySelectorAll("label"))
    .find((l) => /Y \(m\)/.test((l.textContent || "").trim()))
    ?.querySelector("input");
  return { x: xInput?.value, y: yInput?.value };
});
console.log("After drag (with grid snap on, default 1m step):", afterDrag);
const xN = Number(afterDrag.x);
const yN = Number(afterDrag.y);
console.log(
  "  → integer? x=" + (Number.isInteger(xN) ? "YES" : "NO"),
  "y=" + (Number.isInteger(yN) ? "YES" : "NO"),
);

// Toggle ortho ON via F8
await page.keyboard.press("F8");
await new Promise((r) => setTimeout(r, 200));
const orthoOn = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("button")).find((b) =>
    /Ortho \(F8\)/i.test((b.textContent || "").trim()),
  )?.textContent?.trim();
});
console.log("After F8 (ortho):", orthoOn);

// Drag the entity diagonally — should lock to one axis
const after1 = await page.evaluate(() => {
  const el = document.querySelector('[data-test-pick="1"]');
  const r = el.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.mouse.move(after1.cx, after1.cy);
await page.mouse.down();
await page.mouse.move(after1.cx + 60, after1.cy + 30, { steps: 10 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));

const afterOrtho = await page.evaluate(() => {
  const xInput = Array.from(document.querySelectorAll("label"))
    .find((l) => /X \(m\)/.test((l.textContent || "").trim()))
    ?.querySelector("input");
  const yInput = Array.from(document.querySelectorAll("label"))
    .find((l) => /Y \(m\)/.test((l.textContent || "").trim()))
    ?.querySelector("input");
  return { x: xInput?.value, y: yInput?.value };
});
console.log("After diagonal drag w/ ortho ON:", afterOrtho);
console.log(
  "  Δx=" + (Number(afterOrtho.x) - Number(afterDrag.x)).toFixed(2),
  "Δy=" + (Number(afterOrtho.y) - Number(afterDrag.y)).toFixed(2),
);
console.log(
  "  → ortho lock means one delta is 0:",
  Math.abs(Number(afterOrtho.x) - Number(afterDrag.x)) < 0.01 ||
    Math.abs(Number(afterOrtho.y) - Number(afterDrag.y)) < 0.01,
);

await page.screenshot({ path: "./tools/captures/cad-phase3.png" });

console.log("\nErrors:", errs.length);
errs.slice(0, 6).forEach((e) => console.log(" -", e.slice(0, 250)));

await browser.close();
