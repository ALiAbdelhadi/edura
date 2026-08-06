import { defineConfig } from "@playwright/test";

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
