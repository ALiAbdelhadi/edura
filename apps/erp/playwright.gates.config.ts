import { defineConfig } from "@playwright/test";

/* Gates 3 and 4 run against a PRODUCTION server, never `next dev`.
 *
 * The point of the gates is that 15 routes are prerendered at build time. In dev
 * nothing is prerendered — every page is rendered per request and the HTML
 * carries HMR state — so running them against `bun run dev` cannot prove or
 * disprove anything about static output. It fails all 15 routes for a reason
 * that has nothing to do with the code under test.
 *
 * Start the server first:  bun run --filter edura build && bun run --filter edura start
 */
export default defineConfig({
  testDir: "./tests/playwright",
  testMatch: /render-gates\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://localhost:3002",
    headless: true,
    navigationTimeout: 45_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { channel: "chrome" } }],
});
