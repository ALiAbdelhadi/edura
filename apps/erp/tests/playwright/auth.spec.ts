/**
 * The login door — the one E2E surface that needs no seeded business data.
 *
 * Revived 2026-08-27. It never hung (it does not call `navigateTo`), but two of
 * its tests asserted on `.ant-alert` / `.ant-alert-error`, and AntD has been
 * gone since the shadcn migration — a selector matching zero elements, so those
 * two could never pass. Analysis:
 * docs/testing/playwright-revival-analysis.md
 *
 * WHAT CHANGED, and why each was a real defect rather than a rename:
 *
 *   * The error banner is `<p role="alert">` (login/page.tsx). Measured against
 *     the running app: bad credentials render "Invalid email or password" there.
 *
 *   * Submitting an EMPTY form does not reach that banner at all — react-hook-form
 *     stops at the zod schema and renders per-field messages ("Email is required",
 *     "Password is required"). The old test waited for a page-level alert that
 *     this path never produces.
 *
 *   * "unauthenticated user cannot access dashboard" waited for
 *     `/(login|dashboard)/` — which matches BOTH outcomes, so it passed whether
 *     the guard held or not. It now requires /login.
 *
 * QUICK-LOGIN TILES ARE DEV-ONLY BY DESIGN — `SHOW_QUICK_LOGINS` is
 * `NODE_ENV !== "production"`. Against a production server they are correctly
 * absent, so those tests SKIP with a reason rather than fail. A skip is loud in
 * the report; an `if (visible)` guard would have been silently green, which is
 * the failure mode this whole suite is being repaired for.
 */
import { test, expect, type Page } from "@playwright/test";
import { login, quickLogin, USERS, type Role } from "./helpers";

const ROLES: Role[] = ["admin", "teacher", "student", "parent"];

/** The dev-only demo tiles. Absent under `next start`; present under `next dev`. */
async function quickLoginsVisible(page: Page): Promise<boolean> {
  return page
    .getByRole("button", { name: "Student", exact: true })
    .isVisible()
    .catch(() => false);
}

test.describe("Authentication & Login", () => {
  test("login page renders the form", async ({ page }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("Enter your password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("an UNKNOWN email gets the sign-up guidance panel, not the red banner", async ({
    page,
  }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("you@example.com").fill("nobody@example.com");
    await page.getByPlaceholder("Enter your password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    // This is a DELIBERATE, Ali-approved exception to H5's enumeration rule —
    // a completely unknown email returns the typed USER_NOT_FOUND so the form
    // can convert it into a sign-up, bounded by C2's rate limiter. See the
    // header of apps/erp/src/lib/auth/auth.ts. Asserted here so that if it is
    // ever narrowed back, the change is deliberate rather than silent.
    await expect(page.getByText(/this email isn.t registered yet/i)).toBeVisible({
      timeout: 15_000,
    });
    // The email is carried over to the sign-up form — that is the whole point
    // of splitting this case out.
    await expect(
      page.getByRole("link", { name: /create an account with this email/i }),
    ).toHaveAttribute("href", /email=nobody%40example\.com/);
    // Not the failure banner.
    await expect(page.locator('[data-slot="form-error"]')).toHaveCount(0);
    expect(page.url()).toContain("/login");
  });

  test("a REAL account with the wrong password reveals nothing about it", async ({
    page,
  }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("you@example.com").fill(USERS.student.email);
    await page.getByPlaceholder("Enter your password").fill("definitely-not-it");
    await page.getByRole("button", { name: /sign in/i }).click();

    // The generic line: for an account that EXISTS, the form must never say
    // whether the password or the account was the problem (H5).
    await expect(page.locator('[data-slot="form-error"]')).toContainText(
      /invalid email or password/i,
      { timeout: 15_000 },
    );
    // And it must not offer the sign-up panel, which would confirm the account.
    await expect(page.getByText(/this email isn.t registered yet/i)).toHaveCount(0);
  });

  test("empty fields are caught per-field, before any request", async ({ page }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Email is required")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Password is required")).toBeVisible();
    // The schema stops it here — nothing was sent, so no banner.
    await expect(page.locator('[data-slot="form-error"]')).toHaveCount(0);
  });

  for (const role of ROLES) {
    test(`manual login as ${role} reaches a dashboard`, async ({ page }) => {
      await login(page, role);
      expect(page.url()).toContain("/dashboard");
    });
  }

  for (const role of ROLES) {
    test(`quick-login tile works for ${role}`, async ({ page }) => {
      await page.goto("/en/login", { waitUntil: "domcontentloaded" });
      test.skip(
        !(await quickLoginsVisible(page)),
        "quick-login tiles are dev-only (SHOW_QUICK_LOGINS = NODE_ENV !== 'production'); this server is in production mode",
      );

      await quickLogin(page, role);
      expect(page.url()).toContain("/dashboard");
    });
  }

  test("an unauthenticated visitor is sent to the login page", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/en/dashboard/admin", { waitUntil: "domcontentloaded" });

    // Was `/(login|dashboard)/`, which matched either outcome.
    await page.waitForURL(/\/login/, { timeout: 15_000, waitUntil: "commit" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  });
});
