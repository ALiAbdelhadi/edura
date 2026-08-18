import { test, expect } from "@playwright/test";
import { login, navigateTo, waitForTableLoad } from "./helpers";

test.describe("Admin Student Management", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "/dashboard/admin/students");
  });

  test("loads with stats and student table", async ({ page }) => {
    await expect(page.getByText("Total Students")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Pending Requests")).toBeVisible();
    await expect(page.getByText("Blacklisted")).toBeVisible();

    await expect(page.locator(".ant-table")).toBeVisible();
  });

  test("search filters students by name", async ({ page }) => {
    await waitForTableLoad(page);
    const initialRows = await page.locator(".ant-table-row").count();

    await page.getByPlaceholder("Search by name or email").fill("lina");
    await page.waitForTimeout(500);

    const filteredRows = await page.locator(".ant-table-row").count();
    expect(filteredRows).toBeLessThanOrEqual(initialRows);
  });

  test("Add Student modal opens and validates email", async ({ page }) => {
    await waitForTableLoad(page);

    await page.getByRole("button", { name: /Add Student/i }).click();

    await expect(page.getByText("Invite student")).toBeVisible();
    await expect(page.getByPlaceholder("student@example.com")).toBeVisible();

    await page.getByRole("button", { name: /Send invite/i }).click();
    await expect(page.getByText("Email required")).toBeVisible();

    await page.getByPlaceholder("student@example.com").fill("notanemail");
    await page.getByRole("button", { name: /Send invite/i }).click();
    await expect(page.getByText("Invalid email")).toBeVisible();

    await page.getByRole("button", { name: /Cancel/i }).click();
    await expect(page.getByText("Invite student")).not.toBeVisible();
  });
});

test.describe("Admin Enrollment Requests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admin");
    await navigateTo(page, "/dashboard/admin/enrollment-requests");
  });

  test("loads enrollment requests page", async ({ page }) => {
    await expect(page.getByText(/enrollment requests/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows pending requests or empty state", async ({ page }) => {
    const pendingCard = page.locator(".ant-card");
    const emptyMsg = page.getByText(/no pending/i);
    await expect(pendingCard.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test("approve/decline buttons visible on pending requests", async ({ page }) => {
    const pendingTag = page.locator(".ant-tag").filter({ hasText: /pending/i }).first();
    if (await pendingTag.isVisible().catch(() => false)) {
      await expect(page.getByRole("button", { name: /approve/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /decline/i }).first()).toBeVisible();
    }
  });
});
