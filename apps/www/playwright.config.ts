import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: false,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3002",
    headless: true,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { channel: "chrome" } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3002",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
