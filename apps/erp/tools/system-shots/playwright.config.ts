import { defineConfig } from "@playwright/test";

/**
 * Config for the marketing-imagery run — a sibling of tools/help-shots, with
 * the same contract: this is TOOLING, not a test suite, so it must not join
 * `test:pw`, and it drives an ALREADY-RUNNING dev server rather than starting
 * its own.
 *
 * Separate from help-shots' config only because `testDir: "."` scopes each one
 * to its own folder; the settings below are deliberately identical, since the
 * two runs must produce comparably-framed images.
 *
 * Run:
 *   PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test \
 *     --config=tools/system-shots/playwright.config.ts
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.HELP_SHOTS_BASE_URL ?? "http://localhost:3002",
    headless: true,
    navigationTimeout: 60_000,
    deviceScaleFactor: 2,
  },
  projects: [{ name: "chromium", use: { channel: "chrome" } }],
});
