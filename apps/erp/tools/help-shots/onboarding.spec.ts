import { test, type Page } from "@playwright/test";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "help");
const ACCOUNT = {
  name: "طالب لقطات الدليل",
  email: "guide-shot-student@edura.test",
  password: "Passw0rd!",
};

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
}

for (const locale of ["ar", "en"] as const) {
  test(`onboarding wizard — ${locale}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`/${locale}/login`);
    await page.getByRole("textbox").first().fill(ACCOUNT.email);
    await page.locator('input[type="password"]').fill(ACCOUNT.password);
    await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
    await page.waitForTimeout(4000);

    if (!/\/onboarding|\/dashboard/.test(page.url())) {
      await page.goto(`/${locale}/register`);
      await settle(page);
      const boxes = page.getByRole("textbox");
      await boxes.nth(0).fill(ACCOUNT.name);
      await boxes.nth(1).fill(ACCOUNT.email);
      const pw = page.locator('input[type="password"]');
      await pw.nth(0).fill(ACCOUNT.password);
      await pw.nth(1).fill(ACCOUNT.password);
      await page.getByRole("button", { name: /create account|إنشاء حساب/i }).last().click();
      await page.waitForTimeout(6000);
    }

    await page.goto(`/${locale}/onboarding`);
    await settle(page);
    await page.screenshot({
      path: path.join(OUT, `student-onboarding-track-${locale}.png`),
      animations: "disabled",
    });
  });
}
