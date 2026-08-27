import { test, expect } from "@playwright/test";
import { login, navigateTo, waitForTableLoad } from "./helpers";

test.describe("Student Dashboard & Grades", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "student");
  });

  test("dashboard loads with KPI cards", async ({ page }) => {
    await navigateTo(page, "/dashboard/student");

    await expect(page.getByText("Attendance Rate")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Average Grade")).toBeVisible();
    await expect(page.getByText("Unread Messages")).toBeVisible();
  });

  test("schedule table renders", async ({ page }) => {
    await navigateTo(page, "/dashboard/student");

    await expect(page.getByText("Today's Schedule")).toBeVisible({ timeout: 10_000 });
  });

  test("grades page shows GPA and subject table", async ({ page }) => {
    await navigateTo(page, "/dashboard/student/grades");

    await expect(page.getByText("Overall GPA")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Subject Grades")).toBeVisible();

    await expect(page.getByRole("columnheader", { name: "Subject" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Grade" })).toBeVisible();
  });

  test("grade letters are valid", async ({ page }) => {
    await navigateTo(page, "/dashboard/student/grades");
    await waitForTableLoad(page);

    const tags = page.locator('[data-slot="status-badge"]');
    const count = await tags.count();
    expect(count).toBeGreaterThan(0);

    const validGrades = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
    for (let i = 0; i < count; i++) {
      const text = await tags.nth(i).textContent();
      if (text && /^[A-DF]/.test(text)) {
        expect(validGrades).toContain(text.trim());
      }
    }
  });

  test("attendance page renders without crash", async ({ page }) => {
    await navigateTo(page, "/dashboard/student/attendance");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Loading").first()).not.toBeVisible({
      timeout: 10_000,
    });
  });
});
