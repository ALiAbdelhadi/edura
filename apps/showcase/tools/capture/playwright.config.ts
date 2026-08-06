import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3021";


export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, scale: 2 },
  mobile: { width: 390, height: 844, scale: 3 },
} as const;

export default defineConfig({
  testDir: ".",
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "capture", testMatch: /capture\.spec\.ts/, dependencies: ["setup"] },
  ],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    timezoneId: "Africa/Cairo",
    ignoreHTTPSErrors: true,
    contextOptions: { reducedMotion: "reduce" },
  },
});
