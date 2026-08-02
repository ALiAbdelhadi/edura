import { defineConfig } from "@playwright/test";

/**
 * Capture harness for the marketing screenshots.
 *
 * This is NOT a test suite — it asserts nothing about apps/www and must never
 * be added to CI. It drives the real, seeded app and writes PNGs. It lives in
 * apps/showcase because the showcase owns the output, and it reads apps/www
 * strictly through the browser, so it cannot affect that app's code.
 *
 * The dev server is NOT started here on purpose (`webServer` is absent):
 * several worktrees run their own www in parallel on this machine, and a
 * harness that spawns one would either collide on the port or capture whichever
 * branch happened to be running. The URL is explicit and the operator points it
 * at the server they mean.
 */
const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3021";

/**
 * Two viewports, because the product is genuinely two shapes.
 *
 * CONSTITUTION.md §4 gives student, parent and center-staff phones BOTTOM
 * navigation rather than a sidebar — so a desktop capture squeezed into a phone
 * frame on the marketing site would show a layout those users never see. The
 * mobile pass exists to make the phone frames honest, not to look thorough.
 *
 * 390×844 is the iPhone 14/15 CSS viewport; `deviceScaleFactor: 3` matches
 * those screens, so the asset is native rather than upscaled.
 */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, scale: 2 },
  mobile: { width: 390, height: 844, scale: 3 },
} as const;

export default defineConfig({
  testDir: ".",
  // Two projects: a `setup` that signs each role in ONCE and saves its cookies,
  // then the capture itself which reuses them. See auth.setup.ts — signing in
  // per test tripped apps/www's own per-email login rate limit (C2).
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "capture", testMatch: /capture\.spec\.ts/, dependencies: ["setup"] },
  ],
  // Sequential: the shots share one seeded database, and a parallel run makes
  // "why is this row different" unanswerable when a screenshot looks wrong.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // One test captures a whole role in one locale — up to twelve screens, each
  // hitting a live database over the network. This is a generous per-ROLE
  // budget, not a per-page one.
  timeout: 300_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    // 2× for the retina asset the brief asks for. The CSS viewport stays
    // 1440×900 so layout matches a normal desktop; only the raster is doubled.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    // Africa/Cairo so seeded session times render as the operator would see
    // them, and a fixed locale so Intl output is stable between runs.
    timezoneId: "Africa/Cairo",
    ignoreHTTPSErrors: true,
    // Animations in apps/www are minimal by design (the single-animation
    // budget), but pinning this removes the last source of frame-to-frame
    // difference between runs. It lives in contextOptions because the
    // top-level `use` type does not carry it.
    contextOptions: { reducedMotion: "reduce" },
  },
});
