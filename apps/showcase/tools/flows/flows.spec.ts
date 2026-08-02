import { test, expect, type Page } from "@playwright/test";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ACCOUNTS, type Locale, type Role } from "../capture/screens";
import { FLOW_LOCALES, type FlowKey } from "./manifest";

/**
 * Recorded product flows.
 *
 * A screenshot proves a screen exists. A flow proves the product WORKS — which
 * is the only claim the showcase is actually making, so these carry the pages
 * that matter most (the counter, the register).
 *
 * WHAT IS DELIBERATELY NOT RECORDED HERE
 * ----------------------------------------------------------------------------
 * No money flow. A completed payment writes to `transactions` / `payments`,
 * which are append-only with `REVOKE UPDATE, DELETE` — so a recorder that runs
 * on every iteration would accumulate rows in the dev database that the demo
 * purge can never remove. The seed's zero-money guarantee would quietly stop
 * being true, and the person who found out would be whoever ran the next
 * census. Money screens get a hand-run flow, once, on purpose.
 *
 * Attendance IS written by these: `attendance_records` is ordinary CRUD and the
 * showcase seed's purge deletes it by session.
 *
 * The video file is left entirely to Playwright — it writes `video.webm` under
 * this config's `outputDir`, and `tools/flows/encode.ts` picks them up from
 * there. An earlier version called `page.context().close()` to grab the path
 * itself and fought the framework for ownership of a file it already manages.
 *
 * WHY EACH FLOW WRITES A START MARK
 * ----------------------------------------------------------------------------
 * The recording begins when the page opens, so it always contains a sign-in and
 * a navigation first. Cutting a fixed number of seconds off the END was the
 * first attempt and it is not good enough: how long the app takes to render
 * varies, so the window opened on apps/www's own "جارٍ التحميل…" state — a
 * marketing clip whose first frame is a loading spinner. Each flow therefore
 * records HOW FAR IN its meaningful part starts, measured from the first
 * navigation, and the encoder trims from that mark instead of from the end.
 */

const PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!";
const MARKS = path.resolve(__dirname, "../../.flows-raw/marks.jsonl");

/**
 * Records where the interesting part of this recording begins.
 *
 * `t0` is taken at the first navigation rather than at test start: Playwright
 * opens the page (and starts recording) during fixture setup, a few hundred ms
 * earlier, and the encoder compensates with a small lead-in so the clip opens
 * on a settled screen rather than exactly on the first painted frame.
 */
async function mark(key: FlowKey, locale: Locale, t0: number) {
  await mkdir(path.dirname(MARKS), { recursive: true });
  await appendFile(
    MARKS,
    `${JSON.stringify({ key, locale, startSec: (Date.now() - t0) / 1000 })}\n`,
  );
}

/** A demo student code, from the seeded roster. */
const STUDENT_CODE = "STU-000004";

async function signIn(page: Page, role: Role, locale: Locale) {
  await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(ACCOUNTS[role]);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 30_000 });
}

/**
 * Types like a person rather than pasting. The counter flow is ABOUT an
 * operator entering a code, and a value that appears atomically shows nothing.
 */
async function typeSlowly(page: Page, selector: string, text: string) {
  const field = page.locator(selector).first();
  await field.click();
  await field.pressSequentially(text, { delay: 110 });
}

/**
 * Waits until the screen has actually loaded its DATA.
 *
 * The first version only waited for skeletons and `.animate-pulse`, which the
 * teacher and student screens do not use — they render a SPINNER with a text
 * label instead. So it returned instantly, the start mark was written while the
 * page still said «جارٍ تحميل الجلسات…», and two clips opened on a loading
 * spinner. Waiting on the visible loading COPY catches both shapes, because a
 * screen that is still loading always says so.
 */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {
    // Never fires on screens holding a socket open. The data wait is the real
    // signal; this is only an optimisation when it does fire.
  });
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () => {
        if (document.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length)
          return false;
        // "جارٍ تحميل…" / "Loading…", in any of their per-screen variants.
        return !/جارٍ\s*تحميل|Loading[.…]/i.test(document.body.innerText);
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// 1 — The counter. The most important flow on the site: a receptionist finds a
// student by code, standing, with a queue waiting.
// ---------------------------------------------------------------------------
for (const locale of FLOW_LOCALES) {
  test(`counter-checkin ${locale}`, async ({ page }) => {
    const t0 = Date.now();
    await signIn(page, "staff", locale);
    await page.goto(`/${locale}/dashboard/staff/checkin`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page);
    await page.waitForTimeout(700);
    await mark("counter-checkin", locale, t0);

    await typeSlowly(page, 'input[inputmode="search"], input[type="text"]', STUDENT_CODE);
    await page.waitForTimeout(400);

    await page
      .getByRole("button", { name: locale === "ar" ? "بحث" : /search/i })
      .first()
      .click();

    // The result is the proof the lookup resolved. Without this the recording
    // could be eight seconds of an empty box, which is worse than no video.
    await expect(page.getByText(/مريم|Maryam|STU-000004/).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(1800);
  });
}

// ---------------------------------------------------------------------------
// 2 — The register. Leads /teachers per the storyboard.
// ---------------------------------------------------------------------------
for (const locale of FLOW_LOCALES) {
  test(`teacher-register ${locale}`, async ({ page }) => {
    const t0 = Date.now();
    await signIn(page, "teacher", locale);
    await page.goto(`/${locale}/dashboard/teacher/attendance`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page);
    await page.waitForTimeout(1200);
    await mark("teacher-register", locale, t0);

    // Wheel rather than scrollTo — the app owns its own scroll behaviour.
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 220);
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(1200);
  });
}

// ---------------------------------------------------------------------------
// 3 — Track → subjects. The student story's opening move, and read-only.
// ---------------------------------------------------------------------------
for (const locale of FLOW_LOCALES) {
  test(`student-subjects ${locale}`, async ({ page }) => {
    const t0 = Date.now();
    await signIn(page, "student", locale);
    await page.goto(`/${locale}/dashboard/student/subjects`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page);
    await page.waitForTimeout(1500);
    await mark("student-subjects", locale, t0);

    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 260);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1000);
  });
}
