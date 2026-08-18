/**
 * Drives the assistant's first-run guided tour.
 *
 * The gate is `user_prefs.tour_completed`, a PER-USER flag, so this test must
 * reset it through the same API the app writes it with — otherwise the tour
 * opens once, ever, and the second run tests nothing.
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { ASSISTANT_TOUR_STEPS } from "../../src/features/assistant/tour/steps";

const OUT = path.join(process.cwd(), "public", "help");
const ASSISTANT = { email: "sara.fawzy@nile-academy.eg", password: "Passw0rd!" };

async function signIn(page: Page, locale: string) {
  await page.goto(`/${locale}/login`);
  await page.getByRole("textbox").first().fill(ASSISTANT.email);
  await page.locator('input[type="password"]').fill(ASSISTANT.password);
  await page.getByRole("button", { name: /sign in|تسجيل الدخول/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * Hide Next.js's dev-tools badge.
 *
 * It is a fixed overlay in the bottom-left corner and it INTERCEPTS CLICKS: a
 * tour card placed low on the left (which happens in LTR, where the sidebar
 * anchors are on the left) puts its buttons under it, and the click never
 * lands. The badge does not exist in a production build, so this is a harness
 * concern, not something the product should place around.
 */
async function hideDevBadge(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
}

/** Put the account back to "never seen the tour". */
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
  test(`assistant tour walks every card — ${locale}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, locale);
    await resetGate(page);
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await hideDevBadge(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    // The welcome card is first and carries no spotlight.
    await expect(dialog.getByText(locale === "ar" ? "إنت مساعد مدرّس" : "you're a teacher's assistant")).toBeVisible();

    const nextLabel = locale === "ar" ? "التالي" : "Next";
    const finishLabel = locale === "ar" ? "يلا نبدأ" : "Let's go";

    let steps = 1;
    for (let i = 0; i < 20; i++) {
      const nextBtn = dialog.getByRole("button", { name: nextLabel });
      if (!(await nextBtn.isVisible().catch(() => false))) break;
      if (steps === 4) {
        // The subscribe card: a real sidebar item spotlit, with its procedure.
        await page.screenshot({ path: path.join(OUT, `assistant-tour-${locale}.png`) });
      }
      expect(
        await dialog.locator("text=/assistant\\.tour\\./").count(),
        `raw i18n key on card ${steps}`,
      ).toBe(0);
      await nextBtn.click();
      steps++;
      await page.waitForTimeout(250);
    }

    // No card may print a raw i18n key. This caught a real defect: `note` is
    // optional, and next-intl returns the KEY PATH for a missing key, so every
    // step without a note rendered "studentTour.steps.<id>.note" on screen.
    const leaked = await dialog.locator("text=/assistant\\.tour\\./").count();
    expect(leaked, "a raw i18n key is visible in the assistant tour").toBe(0);

    // The last card swaps Next for the finish action.
    await expect(dialog.getByRole("button", { name: finishLabel })).toBeVisible();
    await expect(
      dialog.getByText(locale === "ar" ? "دلوقتي دورك" : "your turn"),
    ).toBeVisible();
    // 14 cards: welcome + twelve tasks + finish. Asserted against the script so
    // adding a step to `steps.ts` fails here until the test is looked at.
    expect(steps).toBe(ASSISTANT_TOUR_STEPS.length);

    await dialog.getByRole("button", { name: finishLabel }).click();
    await expect(dialog).toBeHidden();
    console.log(`TOUR[${locale}] walked ${steps} cards`);
  });
}

test("assistant: the tour opens once and not again", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "ar");
  await resetGate(page);
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  await hideDevBadge(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  // Skipping counts as done — that is the whole point of the gate.
  await dialog.getByRole("button", { name: "تخطّي" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
  await expect(dialog).toBeHidden();
});

test("assistant: Escape closes the tour", async ({ page }) => {
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

/**
 * THE PHONE CASE.
 *
 * On a phone the sidebar does not exist — the bottom bar does — and both are in
 * the DOM at once, so a naive `querySelector` resolves to the hidden one and
 * draws the spotlight over nothing in the corner. This asserts the opposite:
 * every anchored card lands on an element that is really on screen.
 */
test("assistant: the spotlight lands on a visible element at phone width", async ({ page }) => {
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
      // A real box, not a 0×0 collapse over a hidden node…
      expect(probe.w, `card ${i} spotlight width`).toBeGreaterThan(8);
      expect(probe.h, `card ${i} spotlight height`).toBeGreaterThan(8);
      // …and on screen, not parked off the top-left corner.
      expect(probe.top, `card ${i} spotlight top`).toBeGreaterThan(-40);
      expect(probe.top).toBeLessThan(probe.vh);
      expect(probe.left).toBeLessThan(probe.vw);
    }

    const nextBtn = dialog.getByRole("button", { name: "التالي" });
    if (!(await nextBtn.isVisible().catch(() => false))) break;
    await nextBtn.click();
    await page.waitForTimeout(250);
  }

  // Most cards are anchored; only welcome and finish are deliberately centred.
  console.log(`PHONE: ${anchored} anchored cards`);
  expect(anchored).toBeGreaterThanOrEqual(8);
});
