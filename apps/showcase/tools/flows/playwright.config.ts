import { defineConfig } from "@playwright/test";
import path from "node:path";

/**
 * Flow recorder. Like tools/capture this drives the real seeded app and
 * asserts almost nothing about it — but unlike capture it MUTATES (attendance),
 * so it is never part of any test run.
 *
 * 1280×800 rather than the capture pass's 1440×900: video bytes scale with
 * area, the clips are displayed around 900px wide, and `deviceScaleFactor` is
 * 1 because a 2× recording quadruples the encode for detail the codec throws
 * away anyway.
 */
const RECORD_SIZE = { width: 1280, height: 800 };

export default defineConfig({
  testDir: ".",
  testMatch: /flows\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  // Playwright writes `<outputDir>/<spec>-<title-slug>/video.webm`. Owning the
  // directory rather than the file is what keeps the recorder out of the
  // framework's way — encode.ts globs from here.
  outputDir: path.resolve(__dirname, "../../.flows-raw"),
  use: {
    baseURL: process.env.CAPTURE_BASE_URL ?? "http://localhost:3021",
    viewport: RECORD_SIZE,
    deviceScaleFactor: 1,
    timezoneId: "Africa/Cairo",
    ignoreHTTPSErrors: true,
    // `video`, not `recordVideo`: the latter is the raw browser-context option
    // and Playwright Test ignores it, leaving `page.video()` null.
    video: { mode: "on", size: RECORD_SIZE },
  },
});
