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
await page.waitForSelector("svg", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));

await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent || "").trim() === "✎ Edit",
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 800));
await page.waitForSelector("svg", { timeout: 30000 });

// Marquee test — drag a rubber-band over an area near the centre of the
// canvas and verify multiple entities get selected.
const svg = await page.$("svg");
const rect = await svg.boundingBox();
// Marquee across a strip in the middle. Need an EMPTY starting point —
// use top-left corner where supports are typically not located.
const startX = rect.x + 60;
const startY = rect.y + 60;
const endX = rect.x + rect.width / 2;
const endY = rect.y + rect.height / 2;
await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(endX, endY, { steps: 12 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));

const afterMarquee = await page.evaluate(() => {
  const heading = Array.from(document.querySelectorAll("p")).find((el) =>
    /Properties\s*·/.test(el.textContent || ""),
  );
  const dashedRings = Array.from(document.querySelectorAll("svg circle")).filter(
    (c) => (c.getAttribute("stroke-dasharray") || "").length > 0,
  );
  return {
    heading: heading?.textContent?.trim(),
    selectedRingCount: dashedRings.length,
  };
});
console.log("After marquee drag (top-left corner → centre):", afterMarquee);

if (afterMarquee.selectedRingCount < 2) {
  console.log("Marquee selected fewer than 2 entities; test inconclusive on multi-drag.");
}

// Multi-drag: pick the first selected entity, drag it 30 px right.
// Every other selected entity should also move by the same delta.
const beforeDrag = await page.evaluate(() => {
  // Capture all entity positions BEFORE
  const svg = document.querySelector("svg");
  const grabbable = Array.from(svg.querySelectorAll("g")).filter(
    (g) =>
      /grab/.test(g.getAttribute("style") || "") || g.style.cursor === "grab",
  );
  const positions = grabbable.slice(0, 60).map((g, i) => {
    g.setAttribute("data-test-idx", String(i));
    const r = g.getBoundingClientRect();
    return { i, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  // Also note which are currently selected (have a dashed ring child)
  const selectedIdx = positions
    .filter(({ i }) => {
      const el = document.querySelector(`[data-test-idx="${i}"]`);
      return Array.from(el.querySelectorAll("circle")).some(
        (c) => (c.getAttribute("stroke-dasharray") || "").length > 0,
      );
    })
    .map((p) => p.i);
  return { positions, selectedIdx };
});
console.log(
  "Selected indices:",
  beforeDrag.selectedIdx,
  "(count:",
  beforeDrag.selectedIdx.length + ")",
);

if (beforeDrag.selectedIdx.length >= 2) {
  // Drag the FIRST selected entity by 30 px in X
  const dragIdx = beforeDrag.selectedIdx[0];
  const otherIdx = beforeDrag.selectedIdx[1];
  const dragOrig = beforeDrag.positions[dragIdx];
  const otherOrig = beforeDrag.positions[otherIdx];

  await page.mouse.move(dragOrig.cx, dragOrig.cy);
  await page.mouse.down();
  await page.mouse.move(dragOrig.cx + 30, dragOrig.cy, { steps: 8 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 500));

  const afterDrag = await page.evaluate(({ dragIdx, otherIdx }) => {
    const dragEl = document.querySelector(`[data-test-idx="${dragIdx}"]`);
    const otherEl = document.querySelector(`[data-test-idx="${otherIdx}"]`);
    const dr = dragEl?.getBoundingClientRect();
    const or = otherEl?.getBoundingClientRect();
    return {
      drag: dr ? { cx: dr.x + dr.width / 2, cy: dr.y + dr.height / 2 } : null,
      other: or ? { cx: or.x + or.width / 2, cy: or.y + or.height / 2 } : null,
    };
  }, { dragIdx, otherIdx });

  const dDx = afterDrag.drag.cx - dragOrig.cx;
  const dDy = afterDrag.drag.cy - dragOrig.cy;
  const oDx = afterDrag.other.cx - otherOrig.cx;
  const oDy = afterDrag.other.cy - otherOrig.cy;
  console.log(`Dragged entity Δpx: x=${dDx.toFixed(1)} y=${dDy.toFixed(1)}`);
  console.log(`Other (sibling)  Δpx: x=${oDx.toFixed(1)} y=${oDy.toFixed(1)}`);
  console.log(
    "→ Sibling moved by same delta?",
    Math.abs(dDx - oDx) < 4 && Math.abs(dDy - oDy) < 4 ? "YES" : "NO",
  );
}

await page.screenshot({ path: "./tools/captures/cad-phase5.png" });
console.log("\nErrors:", errs.length);
errs.slice(0, 6).forEach((e) => console.log(" -", e.slice(0, 250)));
await browser.close();
