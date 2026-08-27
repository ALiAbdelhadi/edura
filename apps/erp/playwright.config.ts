import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: false,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    // Overridable, because `reuseExistingServer: true` below will silently adopt
    // whatever is already on 3002 — and `next start` there loads .env.production,
    // i.e. the PRODUCTION database, with no demo accounts and no dev-only
    // quick-login tiles. A suite that adopts it fails for reasons that have
    // nothing to do with the code. Point this at a dev server instead.
    baseURL: process.env.PW_BASE_URL ?? "http://localhost:3002",
    headless: true,
    // Pinned, not incidental. `i18n/routing.ts` sets localePrefix "always" with
    // defaultLocale "ar", so an unprefixed path is resolved by Accept-Language.
    // Without this the suite lands on Arabic the moment a browser sends a
    // different header, and every English assertion in it fails at once.
    locale: "en-US",
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    // Signs in once per role and parks the sessions. `chromium` depends on it,
    // so any spec can opt in with `test.use({ storageState })` — see
    // tests/playwright/auth.setup.ts for why this is a rate limit, not a
    // speed-up.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      // Higher than the 60s default: this project absorbs the dev server's
      // first-compile cost for all four portals so no other spec has to.
      timeout: 120_000,
      use: { channel: "chrome" },
    },
    {
      name: "chromium",
      use: { channel: "chrome" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "bun run dev",
    url: process.env.PW_BASE_URL ?? "http://localhost:3002",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
