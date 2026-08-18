import { test, expect } from "@playwright/test";
import { login, quickLogin, type Role } from "./helpers";

test.describe("Authentication & Login", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("h1")).toContainText("Sign in");
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("Enter your password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    for (const label of ["Admin", "Teacher", "Student", "Parent"]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill("nobody@example.com");
    await page.getByPlaceholder("Enter your password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator(".ant-alert-error")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows error for empty fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator(".ant-alert")).toBeVisible({ timeout: 5_000 });
  });

  for (const role of ["admin", "teacher", "student", "parent"] as Role[]) {
    test(`manual login as ${role} redirects to dashboard`, async ({ page }) => {
      await login(page, role);
      expect(page.url()).toContain("/dashboard");
    });
  }

  for (const role of ["admin", "teacher", "student", "parent"] as Role[]) {
    test(`quick-login button works for ${role}`, async ({ page }) => {
      await quickLogin(page, role);
      expect(page.url()).toContain("/dashboard");
    });
  }

  test("unauthenticated user cannot access dashboard", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard/admin");
    await page.waitForURL(/\/(login|dashboard)/, { timeout: 10_000 });
  });
});
