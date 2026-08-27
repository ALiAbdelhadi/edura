import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.HELP_SHOTS_BASE_URL ?? "http://localhost:3002",
    headless: true,
    navigationTimeout: 60_000,
    deviceScaleFactor: 2,
  },
  projects: [{ name: "chromium", use: { channel: "chrome" } }],
});
