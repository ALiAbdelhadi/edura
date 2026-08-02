import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Verification pass over the showcase itself (Phase 6).
 *
 * Unlike tools/capture, this one DOES assert — it is the check that every page
 * renders in both directions, that no reveal target is left invisible, and that
 * the reduced-motion path shows the same content rather than a blank page.
 *
 * The "left invisible" assertion is the one that earns its keep: a scene whose
 * ScrollTrigger never fires looks identical to a scene that has not been
 * scrolled to, so the failure is silent in every manual check.
 */
// Phase 4 adds the role pages here; typed as string[] rather than a const
// tuple so a single-entry list does not narrow `route` to a literal and make
// the else-branch unreachable.
const PAGES: string[] = ["/"];
const LOCALES = ["ar", "en"] as const;
const OUT = path.resolve(__dirname, "../../verify-out");

for (const locale of LOCALES) {
  for (const route of PAGES) {
    const name = route === "/" ? "home" : route.replace(/\//g, "-").replace(/^-/, "");

    test(`${name} · ${locale} · motion`, async ({ page }) => {
      await page.goto(`/${locale}${route === "/" ? "" : route}`, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);

      expect(await page.getAttribute("html", "dir")).toBe(locale === "ar" ? "rtl" : "ltr");

      // Walk the page the way a reader does. A single jump to the bottom would
      // skip every ScrollTrigger start, and — because Lenis owns the scroll —
      // would also desync the compositor from the DOM.
      //
      // The walk runs until scrolling STOPS MOVING, not for a step count
      // derived from the height measured at load. A pinned scene adds its own
      // scroll distance once ScrollTrigger initialises, so the page grows after
      // that measurement: the fixed-count version stopped part-way down and
      // reported every scene below the pin as "never revealed".
      let last = -1;
      for (let i = 0; i < 500; i++) {
        const y = await page.evaluate(() => Math.round(window.scrollY));
        if (y === last) break; // bottom reached, or nothing is moving
        last = y;
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(110);
      }
      // Wait for every reveal to RESOLVE rather than for a fixed duration.
      // A fixed wait races the hero timeline (~1.6s end to end) and fails
      // intermittently on whichever locale happens to lay out shorter — which
      // it did. A bounded condition still fails loudly when something is
      // genuinely stuck; it just stops reporting "slow" as "broken".
      await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll("[data-reveal]")].every(
              (el) => Number(getComputedStyle(el).opacity) >= 0.9,
            ),
          undefined,
          { timeout: 10_000 },
        )
        .catch(() => {});

      // Nothing a scene claimed may still be invisible after the reader has
      // passed it.
      const hidden = await page.$$eval("[data-reveal]", (els) =>
        els
          .filter((el) => Number(getComputedStyle(el).opacity) < 0.9)
          .map((el) => `${el.tagName}.${el.className}`.slice(0, 80)),
      );
      expect(hidden, `still invisible after scrolling:\n${hidden.join("\n")}`).toEqual([]);

      await mkdir(OUT, { recursive: true });
      await page.screenshot({
        path: path.join(OUT, `${name}.${locale}.full.png`),
        fullPage: true,
      });
    });

    test(`${name} · ${locale} · reduced motion`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/${locale}${route === "/" ? "" : route}`, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.ready);

      // The whole reduced-motion contract in one assertion: no timeline is ever
      // built, so the painted state must ALREADY be the final state — with no
      // scrolling, no triggers, and no GSAP chunk.
      expect(await page.getAttribute("html", "data-motion")).toBe("reduced");
      const hidden = await page.$$eval("[data-reveal]", (els) =>
        els
          .filter((el) => Number(getComputedStyle(el).opacity) < 0.9)
          .map((el) => `${el.tagName}.${el.className}`.slice(0, 80)),
      );
      expect(
        hidden,
        `reduced motion left content hidden — the page is unreadable for these users:\n${hidden.join("\n")}`,
      ).toEqual([]);

      await mkdir(OUT, { recursive: true });
      await page.screenshot({
        path: path.join(OUT, `${name}.${locale}.reduced.png`),
        fullPage: true,
      });
    });
  }
}
