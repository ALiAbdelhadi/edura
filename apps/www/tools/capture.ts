/**
 * Full-page captures of the landing page, in every combination that can
 * actually break it: both scripts (RTL/LTR), both themes, desktop and phone.
 *
 * A design reviewed only as source code has not been reviewed — and the
 * combinations matter here specifically because the page mirrors: the money
 * column, the seal's rotation and the register's rules all sit on the inline
 * axis, so a bug that is invisible in English appears in Arabic and vice
 * versa.
 *
 *   bun run --cwd apps/www-v2 capture          (dev server must be on :3010)
 */
import { chromium, type Page } from "playwright";

const BASE = process.env.CAPTURE_BASE_URL ?? "http://localhost:3010";
const OUT = new URL("../shots/", import.meta.url).pathname;

type ShotBase = {
  name: string;
  locale: "ar" | "en";
  theme: "light" | "dark";
  width: number;
  height: number;
};

type Shot = ShotBase & { path?: string };

const SHOTS: Shot[] = [
  { name: "ar-light-desktop", locale: "ar", theme: "light", width: 1440, height: 900 },
  { name: "ar-dark-desktop", locale: "ar", theme: "dark", width: 1440, height: 900 },
  { name: "en-light-desktop", locale: "en", theme: "light", width: 1440, height: 900 },
  { name: "en-dark-desktop", locale: "en", theme: "dark", width: 1440, height: 900 },
  { name: "ar-light-phone", locale: "ar", theme: "light", width: 390, height: 844 },
  { name: "en-dark-phone", locale: "en", theme: "dark", width: 390, height: 844 },

  // The role pages. One per role rather than one per role × theme × locale:
  // they share every component with the landing, which is already captured in
  // all four combinations, so what these add is CONTENT LENGTH — the thing
  // that actually differs between them and the thing that overflows.
  { name: "ar-for-center", locale: "ar", theme: "light", width: 1440, height: 900, path: "/for/center" },
  { name: "ar-for-teacher", locale: "ar", theme: "dark", width: 1440, height: 900, path: "/for/teacher" },
  { name: "en-for-parent", locale: "en", theme: "light", width: 1440, height: 900, path: "/for/parent" },
  { name: "ar-for-student-phone", locale: "ar", theme: "light", width: 390, height: 844, path: "/for/student" },
  { name: "ar-for-assistant", locale: "ar", theme: "light", width: 1440, height: 900, path: "/for/assistant" },

  // The standalone pages. Arabic is the default locale and the one that can
  // break (RTL, connected script, long legal prose), so it carries four of the
  // five; pricing takes the English pass because its worked example is the one
  // place a figure and a currency word sit together in a Latin sentence.
  { name: "ar-pricing", locale: "ar", theme: "light", width: 1440, height: 900, path: "/pricing" },
  { name: "en-pricing", locale: "en", theme: "dark", width: 1440, height: 900, path: "/pricing" },
  { name: "ar-faq", locale: "ar", theme: "light", width: 1440, height: 900, path: "/faq" },
  { name: "ar-trust", locale: "ar", theme: "dark", width: 1440, height: 900, path: "/trust" },
  { name: "ar-privacy", locale: "ar", theme: "light", width: 1440, height: 900, path: "/privacy" },
  { name: "ar-terms-phone", locale: "ar", theme: "light", width: 390, height: 844, path: "/terms" },
  { name: "ar-contact", locale: "ar", theme: "light", width: 1440, height: 900, path: "/contact" },
  { name: "en-contact-phone", locale: "en", theme: "dark", width: 390, height: 844, path: "/contact" },
];

/**
 * Wait for the page to finish being written, then verify it.
 *
 * A `fullPage` screenshot scrolls the document to stitch it, which fires
 * every ScrollTrigger on the way past — so a naive sleep produced captures of
 * the hero total at 83.33 and the settlement figures at 0.00: numbers that
 * were true for one frame and wrong on paper. On a page whose argument is
 * that its figures are right, a screenshot of a half-posted figure is the
 * worst possible artifact.
 *
 * So: wait for the hero's own settled flag, walk the page to fire every
 * scroll-triggered counter, return to the top, and then ASSERT that every
 * figure matches the value it shipped with before a pixel is captured.
 */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page
    .waitForFunction(() => document.documentElement.dataset.motionSettled !== undefined, null, {
      timeout: 5000,
    })
    // Under `prefers-reduced-motion` the flag is never set because the
    // timeline is never built. That is correct, not a failure.
    .catch(() => {});

  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = "auto";
    const step = window.innerHeight * 0.75;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
}

/** Every posted figure must read exactly what it shipped with. */
async function figuresAreTrue(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-count]")]
      .filter((el) => el.textContent !== el.dataset.count)
      .map((el) => `${el.dataset.count} rendered as ${el.textContent}`),
  );
}

const browser = await chromium.launch();
const failures: string[] = [];

/* WARM EVERY ROUTE FIRST.
   Against `next dev`, the first request to a route compiles it, and a capture
   that arrives during that compile sees a 500 and a half-posted figure. That
   is not a page defect, but a tool whose first run fails for a non-reason
   teaches people to re-run and ignore it — which is exactly when it stops
   catching the real thing. One warm-up pass costs a few seconds and makes
   every failure below mean something. */
{
  const warm = await browser.newContext();
  const page = await warm.newPage();
  for (const path of new Set(SHOTS.map((s) => `${s.locale}${s.path ?? ""}`))) {
    // RETRY UNTIL A REAL 200. Swallowing the failure is not warming: the first
    // request compiles the route and can 500, and a chunk that is still
    // compiling throws `ReferenceError` in the browser for a symbol the source
    // exports perfectly well. Both look exactly like source defects in the
    // failure list, which is how a real one would get waved through.
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await page
        .goto(`${BASE}/${path}`, { waitUntil: "domcontentloaded" })
        .catch(() => null);
      if (response?.ok()) break;
      await page.waitForTimeout(600);
    }
  }
  await warm.close();
}

for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
    colorScheme: shot.theme,
    locale: shot.locale === "ar" ? "ar-EG" : "en-US",
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/${shot.locale}${shot.path ?? ""}`, { waitUntil: "domcontentloaded" });
  await settle(page);

  // The horizontal axis is the one this layout can break. Assert it, rather
  // than hoping a reviewer notices a 3px scrollbar in a screenshot.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) failures.push(`${shot.name}: horizontal overflow of ${overflow}px`);
  if (consoleErrors.length) failures.push(`${shot.name}: console errors — ${consoleErrors[0]}`);

  const wrongFigures = await figuresAreTrue(page);
  if (wrongFigures.length) failures.push(`${shot.name}: mid-count figure — ${wrongFigures[0]}`);

  await page.screenshot({ path: `${OUT}${shot.name}.png`, fullPage: true });
  console.log(`captured ${shot.name}`);

  await context.close();
}

await browser.close();

if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("\nall captures clean");
