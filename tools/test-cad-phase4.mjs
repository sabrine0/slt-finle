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
    if (!/hydrat|preventDefault inside passive/i.test(t)) errs.push("CONSOLE " + t.slice(0, 250));
  }
});

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent || "").trim() === "✎ Edit",
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 500));

// Pick a draggable, click to select, read initial pos
await page.evaluate(() => {
  const svg = document.querySelector("svg");
  const grabbable = Array.from(svg.querySelectorAll("g")).filter(
    (g) => /grab/.test(g.getAttribute("style") || "") || g.style.cursor === "grab",
  );
  grabbable[0].setAttribute("data-test-pick", "1");
});
const beforeBox = await page.evaluate(() => {
  const el = document.querySelector('[data-test-pick="1"]');
  const r = el.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});

// Click to select
await page.mouse.click(beforeBox.cx, beforeBox.cy);
await new Promise((r) => setTimeout(r, 400));

const initialXY = await page.evaluate(() => {
  const x = Array.from(document.querySelectorAll("label")).find((l) => /X \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  const y = Array.from(document.querySelectorAll("label")).find((l) => /Y \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  return { x, y };
});
console.log("Initial:", initialXY);

// Drag once
const beforeDrag1 = await page.evaluate(() => {
  const el = document.querySelector('[data-test-pick="1"]');
  const r = el.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.mouse.move(beforeDrag1.cx, beforeDrag1.cy);
await page.mouse.down();
await page.mouse.move(beforeDrag1.cx + 40, beforeDrag1.cy, { steps: 8 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));

const afterDrag1 = await page.evaluate(() => {
  const x = Array.from(document.querySelectorAll("label")).find((l) => /X \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  const y = Array.from(document.querySelectorAll("label")).find((l) => /Y \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  const undoBtn = Array.from(document.querySelectorAll("button")).find((b) => /Undo/i.test(b.textContent || ""));
  return { x, y, undoLabel: undoBtn?.textContent?.trim(), undoDisabled: undoBtn?.disabled };
});
console.log("After drag 1:", afterDrag1);

// Drag again
const beforeDrag2 = await page.evaluate(() => {
  const el = document.querySelector('[data-test-pick="1"]');
  const r = el.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.mouse.move(beforeDrag2.cx, beforeDrag2.cy);
await page.mouse.down();
await page.mouse.move(beforeDrag2.cx + 40, beforeDrag2.cy, { steps: 8 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));

const afterDrag2 = await page.evaluate(() => {
  const x = Array.from(document.querySelectorAll("label")).find((l) => /X \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  const y = Array.from(document.querySelectorAll("label")).find((l) => /Y \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  const undoBtn = Array.from(document.querySelectorAll("button")).find((b) => /Undo/i.test(b.textContent || ""));
  return { x, y, undoLabel: undoBtn?.textContent?.trim() };
});
console.log("After drag 2:", afterDrag2);

// Ctrl+Z — should revert to drag-1 position
await page.keyboard.down("Control");
await page.keyboard.press("z");
await page.keyboard.up("Control");
await new Promise((r) => setTimeout(r, 400));

const afterUndo1 = await page.evaluate(() => {
  const x = Array.from(document.querySelectorAll("label")).find((l) => /X \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  const y = Array.from(document.querySelectorAll("label")).find((l) => /Y \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  const undoBtn = Array.from(document.querySelectorAll("button")).find((b) => /Undo/i.test(b.textContent || ""));
  const redoBtn = Array.from(document.querySelectorAll("button")).find((b) => /Redo/i.test(b.textContent || ""));
  return { x, y, undoLabel: undoBtn?.textContent?.trim(), redoLabel: redoBtn?.textContent?.trim() };
});
console.log("After Ctrl+Z (undo 1):", afterUndo1);

// Ctrl+Z again — should revert to initial position
await page.keyboard.down("Control");
await page.keyboard.press("z");
await page.keyboard.up("Control");
await new Promise((r) => setTimeout(r, 400));
const afterUndo2 = await page.evaluate(() => {
  const x = Array.from(document.querySelectorAll("label")).find((l) => /X \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  const y = Array.from(document.querySelectorAll("label")).find((l) => /Y \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  const undoBtn = Array.from(document.querySelectorAll("button")).find((b) => /Undo/i.test(b.textContent || ""));
  return { x, y, undoLabel: undoBtn?.textContent?.trim(), undoDisabled: undoBtn?.disabled };
});
console.log("After Ctrl+Z (undo 2):", afterUndo2);

// Ctrl+Y — redo once → drag-1
await page.keyboard.down("Control");
await page.keyboard.press("y");
await page.keyboard.up("Control");
await new Promise((r) => setTimeout(r, 400));
const afterRedo1 = await page.evaluate(() => {
  const x = Array.from(document.querySelectorAll("label")).find((l) => /X \(m\)/.test(l.textContent || ""))?.querySelector("input")?.value;
  return { x };
});
console.log("After Ctrl+Y (redo 1):", afterRedo1);

console.log("\nErrors:", errs.length);
errs.slice(0, 6).forEach((e) => console.log(" -", e.slice(0, 250)));
await browser.close();
