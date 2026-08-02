import { test as setup, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { ACCOUNTS, ROLES } from "./screens";
import { STATE_DIR, statePath } from "./auth-state";

/**
 * Signs each role in ONCE and saves its cookies for the capture run to reuse.
 *
 * WHY THIS EXISTS
 * ----------------------------------------------------------------------------
 * The capture matrix is 6 roles × 2 locales × up to 2 devices. Signing in
 * inside each test meant ~20 sign-ins, four of them against the same student
 * account — and apps/www rate-limits logins per email (security fix C2, five
 * attempts). The run started failing on `waitForURL` with no hint that the
 * cause was the app defending itself correctly.
 *
 * Six sign-ins total, reused everywhere, is both under the limit and much
 * faster. It also means the capture run no longer exercises the login form
 * twenty times to take screenshots of something else.
 *
 * The state files hold real session cookies for demo accounts on a dev
 * database. They live in a gitignored directory and are regenerated on demand.
 */

const PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!";

for (const role of ROLES) {
  setup(`authenticate ${role}`, async ({ page }) => {
    await mkdir(STATE_DIR, { recursive: true });

    // Always sign in through the Arabic form: it is the product's default
    // locale, and the session it mints is locale-independent.
    await page.goto("/ar/login", { waitUntil: "domcontentloaded" });

    const email = page.locator('input[name="email"]');
    const password = page.locator('input[type="password"]');

    // FILL AFTER HYDRATION, AND PROVE IT STUCK.
    //
    // These are react-hook-form controlled inputs. Playwright's `fill()` can
    // land before React has attached its handlers, and hydration then resets
    // the field to its empty default — the form submitted blank and the page
    // came back with «البريد الإلكتروني مطلوب» while the harness sat waiting
    // for a /dashboard URL that was never coming. It failed on a different
    // subset of roles each run, which is exactly what a hydration race looks
    // like.
    //
    // Waiting for the network to settle is not sufficient on its own, so the
    // value is asserted after filling; `toHaveValue` retries, so a reset mid-way
    // is corrected rather than silently shipped.
    await page.waitForLoadState("networkidle").catch(() => {});
    await email.fill(ACCOUNTS[role]);
    await password.fill(PASSWORD);
    await expect(email).toHaveValue(ACCOUNTS[role]);
    await expect(password).toHaveValue(PASSWORD);

    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 45_000 });
    expect(page.url()).not.toMatch(/\/login/);

    await page.context().storageState({ path: statePath(role) });
  });
}
