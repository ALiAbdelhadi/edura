/**
 * Drives the centre-staff first-run guided tour.
 *
 * The interesting property here is not that it walks — it is that the THREE
 * TIERS GET THREE DIFFERENT TOURS. This portal's nav is already filtered per
 * sub-role, and a tour that ignored that would point a receptionist at revenue
 * reports and an accountant at the counter. So the test signs in as whoever the
 * seeded staff accounts are, asks the app which tier it is, and asserts the
 * matching welcome card — the one thing that proves the split is live.
 */
import { test, expect, type Page } from "@playwright/test";
import { staffTourSteps, type StaffTier } from "../../src/features/admin/staff-tour/steps";

// One account per tier, so all three scripts are exercised — the receptionist
// most of all, since the counter board is that tier's entire job.
const STAFF = [
  "bimpdemo-rania@edura.test",   // receptionist
  "rexpdemo-sameh@edura.test",   // manager
  "rexpdemo-azza@edura.test",    // center_accountant
];
const PASSWORD = "Passw0rd!";

/** Hide Next's dev badge — it intercepts clicks in the bottom-left corner. */
async function hideDevBadge(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
}

async function signIn(page: Page, email: string) {
  await page.goto("/ar/login");
  await page.getByRole("textbox").first().fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /تسجيل الدخول/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 40_000 });
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

/** The welcome card each tier must land on. */
const WELCOME: Record<StaffTier, string> = {
  receptionist: "إنت على الكاونتر",
  manager: "إنت مدير السنتر",
  center_accountant: "إنت محاسب السنتر",
};

for (const email of STAFF) {
  test(`staff tour matches the signed-in tier — ${email}`, async ({ page }) => {
    test.setTimeout(200_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, email);

    // Ask the app which tier this is rather than assuming from the fixture.
    const tier = (await page.evaluate(async () => {
      const r = await fetch("/api/v1/center/staff/me");
      const j = await r.json().catch(() => null);
      return j?.data?.role ?? null;
    })) as StaffTier | null;
    expect(tier, "the staff account has a tier").not.toBeNull();
    console.log(`STAFF[${email}] tier=${tier}`);

    await resetGate(page);
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await hideDevBadge(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 40_000 });

    // THE POINT: the welcome card is the tier's own, not a generic one.
    await expect(dialog.getByText(WELCOME[tier!])).toBeVisible();

    let steps = 1;
    for (let i = 0; i < 24; i++) {
      expect(
        await dialog.locator("text=/adminHome\\.staffTour\\./").count(),
        `raw i18n key on card ${steps}`,
      ).toBe(0);
      const nextBtn = dialog.getByRole("button", { name: "التالي" });
      if (!(await nextBtn.isVisible().catch(() => false))) break;
      await nextBtn.click();
      steps++;
      await page.waitForTimeout(250);
    }

    await expect(dialog.getByRole("button", { name: "يلا نبدأ" })).toBeVisible();
    // The walked length must equal the tier's own script, not another tier's.
    expect(steps).toBe(staffTourSteps(tier).length);

    await dialog.getByRole("button", { name: "يلا نبدأ" }).click();
    await expect(dialog).toBeHidden();
    console.log(`STAFF[${tier}] walked ${steps} cards`);
  });
}

test("staff: the spotlight lands on a visible element at phone width", async ({ page }) => {
  test.setTimeout(200_000);
  await page.setViewportSize({ width: 390, height: 780 });
  await signIn(page, STAFF[0]!);
  const tier = (await page.evaluate(async () => {
    const r = await fetch("/api/v1/center/staff/me");
    const j = await r.json().catch(() => null);
    return j?.data?.role ?? null;
  })) as StaffTier | null;
  await resetGate(page);
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  await hideDevBadge(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 40_000 });

  let anchored = 0;
  for (let i = 0; i < 24; i++) {
    const probe = await page.evaluate(() => {
      const spot = document.querySelector('[class*="spot"]') as HTMLElement | null;
      if (!spot) return null;
      const r = spot.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), vh: window.innerHeight };
    });
    if (probe) {
      anchored++;
      expect(probe.w, `card ${i} spotlight width`).toBeGreaterThan(8);
      expect(probe.h, `card ${i} spotlight height`).toBeGreaterThan(8);
      expect(probe.top).toBeLessThan(probe.vh);
    }
    const nextBtn = dialog.getByRole("button", { name: "التالي" });
    if (!(await nextBtn.isVisible().catch(() => false))) break;
    await nextBtn.click();
    await page.waitForTimeout(250);
  }
  /* Compared against THIS TIER'S OWN script rather than a hardcoded floor: the
     accountant's tour has four anchored steps and the manager's has ten, so a
     fixed number would either fail for one tier or prove nothing for the other. */
  /* `board-roster` is CONDITIONAL — the roster grid only renders once a lesson
     with students is selected, and a demo centre out of hours has none. So it is
     excluded from the expected count rather than silently loosening the
     assertion for every other anchor. */
  const CONDITIONAL = new Set(["board-roster"]);
  const expected = staffTourSteps(tier).filter(
    (s) => s.anchor && !(typeof s.anchor === "string" && CONDITIONAL.has(s.anchor)),
  ).length;
  console.log(`STAFF PHONE[${tier}]: ${anchored} anchored of ${expected} expected`);
  expect(anchored).toBe(expected);
});
