import { defineConfig, devices } from "@playwright/test";

const FRONTEND_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const BACKEND_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:4010";

export default defineConfig({
  testDir: "./tests",
  // Next dev compiles routes on demand; running tests in parallel
  // makes the first-hit Turbopack compile race itself and time out.
  // Serial execution is reliable and still fast (suite finishes well
  // under a minute once routes are warm).
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: FRONTEND_URL,
    extraHTTPHeaders: { "x-e2e": "1" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  metadata: {
    backendUrl: BACKEND_URL,
  },
});
