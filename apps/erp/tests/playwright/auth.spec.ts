import { test, expect, type Page } from "@playwright/test";
import { login, quickLogin, USERS, type Role } from "./helpers";

const ROLES: Role[] = ["admin", "teacher", "student", "parent"];

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

  test("an UNKNOWN email gets the sign-up guidance panel beside the generic banner", async ({
    page,
  }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("you@example.com").fill("nobody@example.com");
    await page.getByPlaceholder("Enter your password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/don.t have an account yet\?/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("link", { name: /create an account with this email/i }),
    ).toHaveAttribute("href", /email=nobody%40example\.com/);
    await expect(page.locator('[data-slot="form-error"]')).toContainText(
      /invalid email or password/i,
    );
    expect(page.url()).toContain("/login");
  });

  test("a REAL account with the wrong password looks the same as an unknown email", async ({
    page,
  }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("you@example.com").fill(USERS.student.email);
    await page.getByPlaceholder("Enter your password").fill("definitely-not-it");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator('[data-slot="form-error"]')).toContainText(
      /invalid email or password/i,
      { timeout: 15_000 },
    );
    await expect(page.getByText(/don.t have an account yet\?/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /create an account with this email/i }),
    ).toBeVisible();
  });

  test("empty fields are caught per-field, before any request", async ({ page }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Email is required")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Password is required")).toBeVisible();
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

    await page.waitForURL(/\/login/, { timeout: 15_000, waitUntil: "commit" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  });
});
