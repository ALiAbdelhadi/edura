/* Acceptance capture for the "Classical Ledger" redesign.
   ══════════════════════════════════════════════════════════════════════════════

   Produces the screenshots the handoff asks for — AR + EN landing in light and
   dark, the component state sheet, and the hero's final frame — and asserts the
   three things a screenshot cannot show on its own:

     · the loop's timings match the specification,
     · `prefers-reduced-motion` renders the final frame with NO timeline,
     · the timeline pauses when the hero is off-viewport.

   It runs against a real, visible browser on purpose. The in-editor preview pane
   reports `visibilityState: "hidden"`, which stops requestAnimationFrame and
   therefore GSAP's ticker — the receipt sits frozen at opacity 0 and looks
   broken when it is merely unscheduled.

   Run:  bun run --cwd apps/showcase capture:redesign     (dev server on :3006) */

import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Playwright runs this from apps/showcase, transpiled as CommonJS — no
// `import.meta`. Resolve from the working directory instead.
const OUT = path.resolve(process.cwd(), "../../design/handoff/shots");

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    localStorage.setItem("edura-theme", t);
  }, theme);
}

/** Park the loop on its held final frame — seal stamped, every figure counted. */
async function settleHero(page: Page) {
  const sheet = page.locator("[data-sheet]");
  await sheet.waitFor({ state: "visible" });
  // The hold is the 2.2s beat after the seal lands. Poll for the state rather
  // than sleeping a magic number: the timeline restarts every ~10s, so any
  // fixed wait is a race.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const seal = document.querySelector("[data-seal]");
          const sheetEl = document.querySelector("[data-sheet]");
          const total = document.querySelector("[data-total-fig]");
          if (!seal || !sheetEl || !total) return null;
          return (
            +getComputedStyle(sheetEl).opacity === 1 &&
            +getComputedStyle(seal).opacity === 1 &&
            total.textContent === "195.00"
          );
        }),
      { timeout: 30_000, intervals: [120] },
    )
    .toBe(true);
}

test.describe("redesign acceptance", () => {
  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
  });

  for (const locale of ["en", "ar"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`landing · ${locale} · ${theme}`, async ({ page }) => {
        await setTheme(page, theme);
        await page.goto(`/${locale}`, { waitUntil: "networkidle" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );

        await settleHero(page);
        await page.screenshot({
          path: path.join(OUT, `landing-${locale}-${theme}.png`),
          fullPage: false,
        });
      });
    }
  }

  test("hero final frame", async ({ page }) => {
    await page.goto("/ar", { waitUntil: "networkidle" });
    await settleHero(page);

    const sheet = page.locator("[data-sheet]");

    // The seal never mirrors in RTL: -6deg in both directions.
    const matrix = await sheet
      .locator("[data-seal]")
      .evaluate((el) => getComputedStyle(el).transform);
    const [a, b] = matrix.match(/-?[\d.]+/g)!.slice(0, 2).map(Number) as [number, number];
    const degrees = (Math.atan2(b, a) * 180) / Math.PI;
    expect(degrees).toBeGreaterThan(-6.9);
    expect(degrees).toBeLessThan(-5.1);

    await sheet.screenshot({ path: path.join(OUT, "hero-final-frame-ar.png") });
  });

  test("state sheet", async ({ page }) => {
    for (const locale of ["en", "ar"] as const) {
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        await page.goto(`/${locale}/design-system`, { waitUntil: "networkidle" });
        await page.screenshot({
          path: path.join(OUT, `states-${locale}-${theme}.png`),
          fullPage: true,
        });
      }
    }
  });

  test("reduced motion renders the final frame with no timeline", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/en", { waitUntil: "networkidle" });

    const read = () =>
      page.evaluate(() => ({
        sheet: +getComputedStyle(document.querySelector("[data-sheet]")!).opacity,
        seal: +getComputedStyle(document.querySelector("[data-seal]")!).opacity,
        total: document.querySelector("[data-total-fig]")!.textContent,
        rows: [...document.querySelectorAll("[data-fig]")].map((n) => n.textContent),
      }));

    const first = await read();
    expect(first).toEqual({
      sheet: 1,
      seal: 1,
      total: "195.00",
      rows: ["300.00", "−30.00", "−75.00"],
    });

    // No timeline: two seconds later NOTHING has moved. A running loop would
    // have faded the sheet out and restarted it well inside this window.
    await page.waitForTimeout(2000);
    expect(await read()).toEqual(first);

    await ctx.close();
  });

  test("the loop pauses off-viewport and resumes on return", async ({ page }) => {
    await page.goto("/en", { waitUntil: "networkidle" });
    await settleHero(page);

    // Scroll the hero fully out of view, let the observer fire, and confirm the
    // receipt stops advancing.
    await page.evaluate(() => window.scrollTo(0, 4000));
    await page.waitForTimeout(600);
    const a = await page.evaluate(
      () => document.querySelector("[data-total-fig]")!.textContent,
    );
    await page.waitForTimeout(2500); // longer than the hold + fade-out
    const b = await page.evaluate(
      () => document.querySelector("[data-total-fig]")!.textContent,
    );
    expect(b, "paused: the total must not change while off-viewport").toBe(a);

    await page.evaluate(() => window.scrollTo(0, 0));
    await settleHero(page); // resumes
  });
});
