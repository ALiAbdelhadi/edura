import { defineConfig } from "@playwright/test";

/**
 * Verification pass over apps/showcase (Phase 6). Points at the showcase's own
 * dev/prod server, not at apps/www.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /verify\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.VERIFY_BASE_URL ?? "http://localhost:3006",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    timezoneId: "Africa/Cairo",
  },
});
