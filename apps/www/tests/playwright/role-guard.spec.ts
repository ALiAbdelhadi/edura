import { test, expect } from "@playwright/test";
import { login, navigateTo } from "./helpers";

test.describe("Role-Based Access Control", () => {
  test("student cannot access admin pages", async ({ page }) => {
    await login(page, "student");
    await page.goto("/dashboard/admin/students");

    await page.waitForTimeout(3_000);
    expect(page.url()).not.toContain("/admin/students");
  });

  test("teacher cannot access admin pages", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/dashboard/admin/fees");

    await page.waitForTimeout(3_000);
    expect(page.url()).not.toContain("/admin/fees");
  });

  test("parent cannot access teacher pages", async ({ page }) => {
    await login(page, "parent");
    await page.goto("/dashboard/teacher/grades");

    await page.waitForTimeout(3_000);
    expect(page.url()).not.toContain("/teacher/grades");
  });

  test("admin sidebar shows management items", async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "/dashboard/admin");

    const nav = page.locator(".ant-menu");
    await expect(nav).toBeVisible({ timeout: 10_000 });

    for (const label of ["Overview", "Students", "Teachers"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("student sidebar does not show admin items", async ({ page }) => {
    await login(page, "student");
    await navigateTo(page, "/dashboard/student");

    const nav = page.locator(".ant-menu");
    await expect(nav).toBeVisible({ timeout: 10_000 });

    await expect(nav.getByText("Teachers")).not.toBeVisible();
    await expect(nav.getByText("Rooms")).not.toBeVisible();
  });
});
