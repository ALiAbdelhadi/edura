import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const PAGES: string[] = ["/", "/owners", "/teachers", "/students", "/parents", "/trust"];
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

      let last = -1;
      for (let i = 0; i < 500; i++) {
        const y = await page.evaluate(() => Math.round(window.scrollY));
        if (y === last) break;
        last = y;
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(110);
      }
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
