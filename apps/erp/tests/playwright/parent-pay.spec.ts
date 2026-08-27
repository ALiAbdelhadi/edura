import { test, expect, type Page } from "@playwright/test";

const SHOTS = "test-results/parent-pay";

async function quickLoginAsParent(page: Page) {
  await page.goto("/en/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /parent/i }).first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe("Parent — pay for a lesson", () => {
  test.beforeEach(async ({ page }) => {
    await quickLoginAsParent(page);
  });

  test("pay screen renders the child selector, subjects and the payment sheet", async ({
    page,
  }) => {
    await page.goto("/en/dashboard/parent/pay", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: /pay for a lesson/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/from your card or your wallet/i),
    ).toBeVisible();

    await expect(page.getByText("Lina Hassan").first()).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByRole("tab", { name: /child's subjects/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /all subjects/i })).toBeVisible();

    await page.screenshot({ path: `${SHOTS}/01-pay-screen.png`, fullPage: true });

    const subjectRows = page.locator("button[aria-expanded]");
    await expect(subjectRows.first()).toBeVisible({ timeout: 20_000 });
    const subjectCount = await subjectRows.count();
    expect(subjectCount).toBeGreaterThan(0);

    let payButton = null;
    for (let i = 0; i < Math.min(subjectCount, 12); i++) {
      await subjectRows.nth(i).click();
      const candidate = page
        .getByRole("button", { name: /pay for this lesson|pay monthly/i })
        .first();
      if (await candidate.isVisible({ timeout: 4_000 }).catch(() => false)) {
        payButton = candidate;
        break;
      }
      await subjectRows.nth(i).click(); // collapse and try the next one
    }

    expect(
      payButton,
      "no payable course found under any of this child's subjects",
    ).not.toBeNull();

    await page.screenshot({ path: `${SHOTS}/02-courses.png`, fullPage: true });

    const perSession = page.getByRole("button", { name: /pay for this lesson/i }).first();
    if (await perSession.isVisible().catch(() => false)) {
      const picker = page.getByRole("combobox").first();
      await expect(picker).toBeVisible();
      await picker.click();
      const option = page.getByRole("option").first();
      await expect(option).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: `${SHOTS}/03-session-picker.png` });
      await option.click();
      await perSession.click();
    } else {
      await page.getByRole("button", { name: /pay monthly/i }).first().click();
    }

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/confirm payment/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /pay by card/i })).toBeVisible();

    const walletButton = dialog.getByRole("button", { name: /pay from my wallet/i });
    await expect(walletButton).toBeVisible();
    await expect(walletButton).toContainText(/EGP/);

    await page.screenshot({ path: `${SHOTS}/04-payment-sheet.png` });
  });

  test("wallet screen shows the balance and the ledger history", async ({ page }) => {
    await page.goto("/en/dashboard/parent/wallet", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /my wallet/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/wallet balance/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /top up/i })).toBeVisible();
    await expect(page.getByText(/wallet history/i)).toBeVisible();

    await page.screenshot({ path: `${SHOTS}/05-wallet.png`, fullPage: true });
  });
});
