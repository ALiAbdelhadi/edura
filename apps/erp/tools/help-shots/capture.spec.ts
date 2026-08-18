/**
 * Captures the screenshots the student help guide references.
 *
 * Dev-only tooling: it drives the REAL dev server as a REAL student, so a shot
 * can never show a state the product cannot produce. Output lands in
 * `public/help/<slug>-<locale>.png`, which is what `<Shot src>` reads.
 *
 * Run:  bun run --cwd apps/www capture:help
 * (dev server on :3002, with the base + preview seeds applied)
 *
 * ONE TEST PER SCREEN, deliberately. A single test walking thirteen screens
 * shares one timeout budget, so the slowest page fails the twelve that already
 * succeeded — which is what happened on the first run.
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const STUDENT = { email: "lina.hassan@student.nile-academy.eg", password: "Passw0rd!" };
const OUT = path.join(process.cwd(), "public", "help");
const LOCALES = ["ar", "en"] as const;

/** Wide enough for the sidebar layout, short enough that a shot stays readable inline. */
const VIEWPORT = { width: 1280, height: 900 };

/** Portal screens, by the article slug whose `<Shot>` they fill. */
const SCREENS: { slug: string; path: string }[] = [
  { slug: "student-home-and-schedule", path: "" },
  { slug: "student-subjects-and-subscribe", path: "/subjects" },
  { slug: "student-wallet", path: "/wallet" },
  { slug: "student-id-card", path: "/id" },
  { slug: "student-attendance", path: "/attendance" },
  { slug: "student-grades", path: "/grades" },
  { slug: "student-materials", path: "/materials" },
  { slug: "student-reviews", path: "/reviews" },
  { slug: "student-family", path: "/family" },
  { slug: "student-messages", path: "/messages" },
  { slug: "student-notifications", path: "/notifications" },
  { slug: "student-settings-security", path: "/settings" },
];

async function signIn(page: Page, locale: string) {
  await page.goto(`/${locale}/login`);
  await page.getByRole("textbox").first().fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * Waits for the screen's own content rather than a fixed delay: these screens
 * fetch after paint, and a timed wait photographs skeletons.
 */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator("main")).toBeVisible();
  await page.waitForTimeout(600);
}

for (const locale of LOCALES) {
  test.describe(`help shots — ${locale}`, () => {
    test.use({ viewport: VIEWPORT });

    test("register", async ({ page }) => {
      await page.goto(`/${locale}/register`);
      await settle(page);
      await page.screenshot({
        path: path.join(OUT, `student-first-steps-${locale}.png`),
        animations: "disabled",
      });
    });

    for (const screen of SCREENS) {
      test(screen.slug, async ({ page }) => {
        await signIn(page, locale);
        await page.goto(`/${locale}/dashboard/student${screen.path}`);
        await settle(page);
        await page.screenshot({
          path: path.join(OUT, `${screen.slug}-${locale}.png`),
          animations: "disabled",
        });
      });
    }

    test("student-receipts", async ({ page }) => {
      await signIn(page, locale);
      await page.goto(`/${locale}/dashboard/student/wallet`);
      await settle(page);
      // The receipts list is the last section of the wallet screen.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(OUT, `student-receipts-${locale}.png`),
        animations: "disabled",
      });
    });
  });
}
