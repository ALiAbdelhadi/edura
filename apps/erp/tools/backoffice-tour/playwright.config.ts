import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 40_000 },
  use: {
    baseURL: process.env.BACKOFFICE_BASE_URL ?? "http://localhost:3004",
    headless: true,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { channel: "chrome" } }],
});
