/**
 * Plays the emulator end to end, the way a student would.
 *
 * It hardcodes NO step: it repeatedly presses whatever the engine is currently
 * asking for — the highlighted target, or the "got it" button on an
 * explanation — until the finish screen appears. So the walk stays valid when
 * the script in `script.ts` changes, which is the point of the script being
 * data.
 *
 * It also captures the emulator for the help guide while it is there.
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "help");
const STUDENT = { email: "lina.hassan@student.nile-academy.eg", password: "Passw0rd!" };

async function signIn(page: Page, locale: string) {
  await page.goto(`/${locale}/login`);
  await page.getByRole("textbox").first().fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

for (const locale of ["ar", "en"] as const) {
  test(`emulator plays through — ${locale}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await signIn(page, locale);
    await page.goto(`/${locale}/dashboard/student/practice`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Start clean: a previous run's progress is in localStorage.
    await page.evaluate(() => window.localStorage.removeItem("edura.studentEmulator.step"));
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});

    const finish = page.getByText(locale === "ar" ? "خلّصت التدريب" : "You're done");
    const gotIt = page.getByRole("button", { name: locale === "ar" ? "تمام، فهمت" : "Got it" });

    let guard = 0;
    let shotTaken = false;

    while (!(await finish.isVisible().catch(() => false))) {
      if (++guard > 40) throw new Error("emulator did not finish within 40 actions");

      // Capture once, a few steps in, when the simulation is populated.
      if (!shotTaken && guard === 3) {
        await page.screenshot({ path: path.join(OUT, `student-practice-${locale}.png`) });
        shotTaken = true;
      }

      const active = page.locator('[data-emu][data-active="1"]');
      if (await active.count()) {
        await active.first().click();
      } else if (await gotIt.isVisible().catch(() => false)) {
        await gotIt.click();
      } else {
        throw new Error(`stuck: no target and no "got it" at action ${guard}`);
      }
      await page.waitForTimeout(220);
    }

    await expect(finish).toBeVisible();
    console.log(`EMULATOR[${locale}] finished in ${guard} actions`);
  });
}

test("pressing the wrong control nudges instead of advancing", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signIn(page, "ar");
  await page.goto(`/ar/dashboard/student/practice`);
  await page.evaluate(() => window.localStorage.removeItem("edura.studentEmulator.step"));
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});

  // Advance to the first step that actually wants a click.
  const gotIt = page.getByRole("button", { name: "تمام، فهمت" });
  for (let i = 0; i < 6; i++) {
    if (await page.locator('[data-emu][data-active="1"]').count()) break;
    await gotIt.click();
    await page.waitForTimeout(200);
  }

  // Which control the engine is asking for, before the mistake. Asserting on
  // this rather than on the visible step text keeps the test valid when the
  // copy changes — the engine's state is the behaviour under test.
  const before = await page.locator('[data-emu][data-active="1"]').getAttribute("data-emu");
  expect(before).toBeTruthy();

  // Press a control that is NOT the target.
  await page.locator('[data-emu]:not([data-active="1"])').first().click();
  await page.waitForTimeout(300);

  await expect(page.getByText("مش دي")).toBeVisible();
  const after = await page.locator('[data-emu][data-active="1"]').getAttribute("data-emu");
  expect(after).toBe(before); // still waiting on the same control — no advance
});
