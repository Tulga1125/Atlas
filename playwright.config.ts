import { defineConfig, devices } from "@playwright/test";

const live = process.env.ATLAS_E2E_LIVE === "1";
const port = live ? 3101 : 3100;

export default defineConfig({
  testDir: "./tests",
  testMatch: live ? "e2e-live/**/*.spec.ts" : "e2e/**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "off",
  },
  projects: [
    { name: "chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node scripts/start-test-server.mjs${live ? " live" : ""}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
