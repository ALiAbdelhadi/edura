import { defineConfig } from "@playwright/test";

/**
 * The back-office tour walk.
 *
 * It lives under apps/www because that is where Playwright is installed, and it
 * drives the superadmin dev server on :3004. Tooling, not a test suite, so it
 * stays out of `test:pw`.
 */
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
