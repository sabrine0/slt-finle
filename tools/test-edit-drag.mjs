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
page.on("console", (msg) => {
  if (msg.type() === "error") errs.push("CONSOLE " + msg.text().slice(0, 200));
});

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

// 1) Click Edit toggle
const clickedEdit = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /^✎ Edit/.test((b.textContent || "").trim()),
  );
  if (!btn) return false;
  btn.click();
  return true;
});
console.log("Edit toggle clicked:", clickedEdit);

await new Promise((r) => setTimeout(r, 800));

// 2) Verify mode + banner
const afterToggle = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Editing|Edit/.test((b.textContent || "").trim()),
  );
  const banner = Array.from(document.querySelectorAll("div")).find((el) =>
    /Edit mode.*drag any support/i.test(el.textContent || ""),
  );
  return {
    toggleLabel: btn ? (btn.textContent || "").trim() : null,
    bannerText: banner ? (banner.textContent || "").trim().slice(0, 200) : null,
  };
});
console.log("After Edit toggle:", JSON.stringify(afterToggle, null, 2));

// 3) Look for SVG entities — supports/loops/chambers/cabinet
//    are <g> elements that get cursor:grab when editable=true.
const svgInfo = await page.evaluate(() => {
  const svg = document.querySelector("svg");
  if (!svg) return { found: false };
  // Any <g> whose inline cursor is 'grab' is one of our draggables.
  const all = Array.from(svg.querySelectorAll("g"));
  const grabbable = all.filter((g) =>
    /grab/.test(g.getAttribute("style") || "") || g.style.cursor === "grab",
  );
  return {
    found: true,
    totalDraggable: grabbable.length,
    svgRect: (() => {
      const r = svg.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })(),
  };
});
console.log("\nSVG inventory:", JSON.stringify(svgInfo, null, 2));

await page.screenshot({
  path: "./tools/captures/edit-mode-on.png",
  fullPage: false,
});

// 4) Try the drag if there's at least one draggable
if (svgInfo.totalDraggable > 0) {
  // Pick the FIRST grabbable <g>, mark it so we can re-locate it after drag.
  const beforeBox = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const all = Array.from(svg.querySelectorAll("g"));
    const grabbable = all.filter(
      (g) =>
        /grab/.test(g.getAttribute("style") || "") ||
        g.style.cursor === "grab",
    );
    const el = grabbable[0];
    el.setAttribute("data-test-pick", "1");
    const r = el.getBoundingClientRect();
    return {
      cx: r.x + r.width / 2,
      cy: r.y + r.height / 2,
      childCount: el.childElementCount,
    };
  });
  console.log("\nDrag target:", beforeBox);

  await page.mouse.move(beforeBox.cx, beforeBox.cy);
  await page.mouse.down();
  await page.mouse.move(beforeBox.cx + 80, beforeBox.cy + 60, { steps: 12 });
  // While still dragging, capture the on-screen DragReadout
  const midDrag = await page.evaluate(() => {
    const text = Array.from(document.querySelectorAll("svg text")).find((t) =>
      /(support|loop|chamber|cabinet)\s+\S+\s+→\s+x=/.test(
        t.textContent || "",
      ),
    );
    return text ? (text.textContent || "").trim() : null;
  });
  console.log("DragReadout while dragging:", midDrag);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 600));

  const afterBox = await page.evaluate(() => {
    const el = document.querySelector('[data-test-pick="1"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  console.log("After drag:", afterBox);
  console.log(
    "Δx,Δy =",
    afterBox ? afterBox.cx - beforeBox.cx : "?",
    afterBox ? afterBox.cy - beforeBox.cy : "?",
  );

  await page.screenshot({
    path: "./tools/captures/edit-mode-after-drag.png",
    fullPage: false,
  });
} else {
  console.log("\nNO DRAGGABLE ELEMENTS FOUND — checking what is in the SVG");
  const sample = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    if (!svg) return null;
    return svg.innerHTML.slice(0, 1500);
  });
  console.log(sample);
}

console.log("\nErrors during run:", errs.length);
errs.slice(0, 5).forEach((e) => console.log(" -", e.slice(0, 200)));

await browser.close();
