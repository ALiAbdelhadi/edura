import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { TEACHER_TOUR_STEPS } from "../../src/features/teacher/tour/steps";

const OUT = path.join(process.cwd(), "public", "help");
const TEACHER = { email: "hossam.aziz@nile-academy.eg", password: "Passw0rd!" };

async function signIn(page: Page, locale: string) {
  await page.goto(`/${locale}/login`);
  await page.getByRole("textbox").first().fill(TEACHER.email);
  await page.locator('input[type="password"]').fill(TEACHER.password);
  await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function hideDevBadge(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
}

async function resetGate(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/v1/me/prefs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tourCompleted: false }),
    });
  });
}

for (const locale of ["ar", "en"] as const) {
  test(`teacher tour walks every card — ${locale}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, locale);
    await resetGate(page);
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await hideDevBadge(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    await expect(dialog.getByText(locale === "ar" ? "أهلًا بيك في إدورا" : "Welcome to Edura")).toBeVisible();

    const nextLabel = locale === "ar" ? "التالي" : "Next";
    const finishLabel = locale === "ar" ? "يلا نبدأ" : "Let's go";

    let steps = 1;
    for (let i = 0; i < 20; i++) {
      const nextBtn = dialog.getByRole("button", { name: nextLabel });
      if (!(await nextBtn.isVisible().catch(() => false))) break;
      if (steps === 4) {
        await page.screenshot({ path: path.join(OUT, `teacher-tour-${locale}.png`) });
      }
      expect(
        await dialog.locator("text=/teacherTour\\./").count(),
        `raw i18n key on card ${steps}`,
      ).toBe(0);
      await nextBtn.click();
      steps++;
      await page.waitForTimeout(250);
    }

    const leaked = await dialog.locator("text=/teacherTour\\./").count();
    expect(leaked, "a raw i18n key is visible in the teacher tour").toBe(0);

    await expect(dialog.getByRole("button", { name: finishLabel })).toBeVisible();
    await expect(
      dialog.getByText(locale === "ar" ? "دلوقتي دورك" : "your turn"),
    ).toBeVisible();
    expect(steps).toBe(TEACHER_TOUR_STEPS.length);

    await dialog.getByRole("button", { name: finishLabel }).click();
    await expect(dialog).toBeHidden();
    console.log(`TOUR[${locale}] walked ${steps} cards`);
  });
}

test("teacher: the tour opens once and not again", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "ar");
  await resetGate(page);
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  await hideDevBadge(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  await dialog.getByRole("button", { name: "تخطّي" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
  await expect(dialog).toBeHidden();
});

test("teacher: Escape closes the tour", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "ar");
  await resetGate(page);
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  await hideDevBadge(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("teacher: the spotlight lands on a visible element at phone width", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 780 });
  await signIn(page, "ar");
  await resetGate(page);
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  await hideDevBadge(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  let anchored = 0;
  for (let i = 0; i < 20; i++) {
    const probe = await page.evaluate(() => {
      const spot = document.querySelector('[class*="spot"]') as HTMLElement | null;
      if (!spot) return null;
      const r = spot.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        left: Math.round(r.left),
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    if (probe) {
      anchored++;
      expect(probe.w, `card ${i} spotlight width`).toBeGreaterThan(8);
      expect(probe.h, `card ${i} spotlight height`).toBeGreaterThan(8);
      expect(probe.top, `card ${i} spotlight top`).toBeGreaterThan(-40);
      expect(probe.top).toBeLessThan(probe.vh);
      expect(probe.left).toBeLessThan(probe.vw);
    }

    const nextBtn = dialog.getByRole("button", { name: "التالي" });
    if (!(await nextBtn.isVisible().catch(() => false))) break;
    await nextBtn.click();
    await page.waitForTimeout(250);
  }

  console.log(`PHONE: ${anchored} anchored cards`);
  expect(anchored).toBeGreaterThanOrEqual(9);
});
