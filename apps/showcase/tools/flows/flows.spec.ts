import { expect, test, type Page } from "@playwright/test";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ACCOUNTS, type Locale, type Role } from "../capture/screens";
import { FLOW_LOCALES, type FlowKey } from "./manifest";
const PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!";
const MARKS = path.resolve(__dirname, "../../.flows-raw/marks.jsonl");

async function mark(key: FlowKey, locale: Locale, t0: number) {
  await mkdir(path.dirname(MARKS), { recursive: true });
  await appendFile(
    MARKS,
    `${JSON.stringify({ key, locale, startSec: (Date.now() - t0) / 1000 })}\n`,
  );
}

const STUDENT_CODE = "STU-000004";

async function signIn(page: Page, role: Role, locale: Locale) {
  await page.goto(`/${locale}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(ACCOUNTS[role]);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 30_000 });
}

async function typeSlowly(page: Page, selector: string, text: string) {
  const field = page.locator(selector).first();
  await field.click();
  await field.pressSequentially(text, { delay: 110 });
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {
  });
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () => {
        if (document.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length)
          return false;
        return !/جارٍ\s*تحميل|Loading[.…]/i.test(document.body.innerText);
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => { });
}

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

    await expect(page.getByText(/مريم|Maryam|STU-000004/).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(1800);
  });
}

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
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 220);
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(1200);
  });
}

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
