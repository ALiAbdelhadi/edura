import { test, expect } from "@playwright/test";
import { login, navigateTo, waitForTableLoad } from "./helpers";

test.describe("Parent Progress", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "parent");
  });

  test("progress page shows GPA and stats", async ({ page }) => {
    await navigateTo(page, "/dashboard/parent/progress");

    await expect(page.getByText("Overall GPA")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Attendance Rate")).toBeVisible();
    await expect(page.getByText("Subject Breakdown")).toBeVisible();

    // GPA value should be present
    const gpaValue = page.locator(".ant-statistic-content-value").first();
    await expect(gpaValue).not.toBeEmpty();
  });

  test("subject breakdown table renders", async ({ page }) => {
    await navigateTo(page, "/dashboard/parent/progress");
    await waitForTableLoad(page);

    const table = page.locator(".ant-table");
    const emptyMsg = page.getByText(/no grade data/i);
    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Parent Child Linking", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "parent");
    await navigateTo(page, "/dashboard/parent/children");
  });

  test("shows link form with tabs and children table", async ({ page }) => {
    await expect(page.getByText("Link a Child")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator(".ant-card-head-title").filter({ hasText: "My Children" }),
    ).toBeVisible();

    await expect(page.getByText("By Family Code")).toBeVisible();
    await expect(page.getByText("By Email or Phone")).toBeVisible();
  });

  test("family code form validates required field", async ({ page }) => {
    const searchBtn = page.locator(".ant-input-search-button").first();
    await searchBtn.click();

    await expect(page.getByText("Enter the family code")).toBeVisible();
  });

  test("email/phone tab renders form", async ({ page }) => {
    await page.getByText("By Email or Phone").click();

    await expect(page.getByPlaceholder("student@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: /Send Request/i })).toBeVisible();
  });

  test("children table loads", async ({ page }) => {
    await waitForTableLoad(page);
    await expect(page.locator(".ant-table")).toBeVisible();
  });
});

test.describe("Student Family Code", () => {
  test("family code page loads", async ({ page }) => {
    await login(page, "student");
    await navigateTo(page, "/dashboard/student/family");

    await page.waitForSelector(".ant-card", { timeout: 10_000 });
    await expect(page.locator(".ant-alert-error")).toHaveCount(0);
  });
});
