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
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /^✎ Edit/.test((b.textContent || "").trim()),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 600));

// Properties panel should show "0 selected" hint
const beforeClick = await page.evaluate(() => {
  const p = Array.from(document.querySelectorAll("p")).find((el) =>
    /Properties\s*·\s*0 selected/i.test((el.textContent || "").trim()),
  );
  return p ? (p.textContent || "").trim() : null;
});
console.log("Initial properties heading:", beforeClick);

// Click the FIRST grabbable entity (cursor:grab style on a <g>)
const entityCenter = await page.evaluate(() => {
  const svg = document.querySelector("svg");
  const all = Array.from(svg.querySelectorAll("g"));
  const grabbable = all.filter(
    (g) => /grab/.test(g.getAttribute("style") || "") || g.style.cursor === "grab",
  );
  const el = grabbable[0];
  el.setAttribute("data-test-pick", "1");
  const r = el.getBoundingClientRect();
  return {
    cx: r.x + r.width / 2,
    cy: r.y + r.height / 2,
  };
});

// Issue a real click (no drag)
await page.mouse.move(entityCenter.cx, entityCenter.cy);
await page.mouse.down();
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));

const afterClick = await page.evaluate(() => {
  const heading = Array.from(document.querySelectorAll("p")).find((el) =>
    /Properties/i.test((el.textContent || "").trim()),
  );
  // X / Y inputs should now be present
  const xInput = Array.from(document.querySelectorAll("label")).find((l) =>
    /X \(m\)/.test((l.textContent || "").trim()),
  );
  const yInput = Array.from(document.querySelectorAll("label")).find((l) =>
    /Y \(m\)/.test((l.textContent || "").trim()),
  );
  const xVal = xInput?.querySelector("input")?.value ?? null;
  const yVal = yInput?.querySelector("input")?.value ?? null;
  // SelectionRing dashed circle should be present
  const svg = document.querySelector("svg");
  const dashedCircles = Array.from(svg.querySelectorAll("circle")).filter(
    (c) => (c.getAttribute("stroke-dasharray") || "").length > 0,
  );
  // Grip rects: 4 small squares around the selection
  return {
    heading: heading ? (heading.textContent || "").trim() : null,
    xVal,
    yVal,
    dashedCircleCount: dashedCircles.length,
  };
});
console.log("After click:", afterClick);

// Type a new X value, hit Enter → entity should move
const newX = "12.50";
await page.evaluate((v) => {
  const xInput = Array.from(document.querySelectorAll("label"))
    .find((l) => /X \(m\)/.test((l.textContent || "").trim()))
    ?.querySelector("input");
  xInput.focus();
  xInput.select();
}, newX);
await page.keyboard.type(newX);
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 400));

const afterEdit = await page.evaluate(() => {
  const xInput = Array.from(document.querySelectorAll("label"))
    .find((l) => /X \(m\)/.test((l.textContent || "").trim()))
    ?.querySelector("input");
  return { xValueNow: xInput?.value };
});
console.log("After typing X=12.50 + Enter:", afterEdit);

// Press Escape → selection should clear
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 400));

const afterEsc = await page.evaluate(() => {
  const heading = Array.from(document.querySelectorAll("p")).find((el) =>
    /Properties/i.test((el.textContent || "").trim()),
  );
  return heading ? (heading.textContent || "").trim() : null;
});
console.log("After Escape:", afterEsc);

await page.screenshot({ path: "./tools/captures/cad-phase2.png" });

console.log("\nErrors:", errs.length);
errs.slice(0, 6).forEach((e) => console.log(" -", e.slice(0, 250)));

await browser.close();
