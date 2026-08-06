import { defineConfig } from "@playwright/test";
import path from "node:path";

const RECORD_SIZE = { width: 1280, height: 800 };

export default defineConfig({
  testDir: ".",
  testMatch: /flows\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  outputDir: path.resolve(__dirname, "../../.flows-raw"),
  use: {
    baseURL: process.env.CAPTURE_BASE_URL ?? "http://localhost:3021",
    viewport: RECORD_SIZE,
    deviceScaleFactor: 1,
    timezoneId: "Africa/Cairo",
    ignoreHTTPSErrors: true,
    video: { mode: "on", size: RECORD_SIZE },
  },
});
