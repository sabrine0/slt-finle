import puppeteer from "../tools/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js";

const browser = await puppeteer.launch({
  headless: "new",
  defaultViewport: { width: 1900, height: 1100, deviceScaleFactor: 1 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERR:", e.message));
page.on("console", (msg) => {
  const t = msg.text();
  if (msg.type() === "error" || /failed to compile|hmr.*error/i.test(t)) {
    console.log("BROWSER", msg.type().toUpperCase(), ":", t.slice(0, 200));
  }
});

await page.goto(
  "http://localhost:3000/studio/autocad/b28143ec-060f-455f-bb61-eb9a5a646970",
  { waitUntil: "networkidle2", timeout: 60000 },
);
await new Promise((r) => setTimeout(r, 4000));

const earlyBtns = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button"))
    .map((b) => (b.textContent || "").trim().slice(0, 40))
    .filter((t) => t.length > 0),
);
console.log("buttons (immediately after load):");
console.log(JSON.stringify(earlyBtns, null, 2));

const editBtnPresent = !!earlyBtns.find(
  (b) => /Edit/.test(b) && !/Workbench/i.test(b),
);
console.log("\n'Edit' button present:", editBtnPresent);

await page.screenshot({ path: "./tools/captures/edit-mode-load.png" });
await browser.close();
console.log("done");
