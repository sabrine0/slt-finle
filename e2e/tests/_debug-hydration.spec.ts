import { test } from "@playwright/test";
import { firstIntersectionId } from "./_helpers/fixtures";

test("DEBUG: capture full hydration mismatch warning", async ({ page }) => {
  const fullMessages: string[] = [];
  page.on("console", async (msg) => {
    if (msg.type() !== "error") return;
    try {
      // Resolve each arg to its full JS value so we get the React-formatted output.
      const parts: string[] = [];
      for (const arg of msg.args()) {
        const val = await arg.jsonValue().catch(() => null);
        parts.push(typeof val === "string" ? val : JSON.stringify(val));
      }
      fullMessages.push(parts.join(" "));
    } catch {
      fullMessages.push(msg.text());
    }
  });

  const id = await firstIntersectionId();
  await page.goto(`/studio/autocad/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  console.log("\n========= FULL CONSOLE ERRORS =========\n");
  for (const m of fullMessages) {
    console.log("---");
    console.log(m);
  }
  console.log("\n========= END =========\n");
});
