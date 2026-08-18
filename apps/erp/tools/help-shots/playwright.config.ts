import { defineConfig } from "@playwright/test";

/**
 * Config for the help-guide screenshot run — separate from the repo's test
 * config because this is TOOLING, not a test suite: it must not join `test:pw`,
 * and it drives an already-running dev server rather than starting its own
 * (starting a second `next dev` for apps/www is refused by Next 16 anyway).
 */
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
