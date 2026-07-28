import { test, expect } from "@playwright/test";
import { login, navigateTo, waitForTableLoad } from "./helpers";

test.describe("Student Dashboard & Grades", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "student");
  });

  // Three stat cards, not four. "Assignments Due" was removed with the assignments
  // feature (DECISIONS.md D-029) — there is no Assignment model behind it.
  test("dashboard loads with KPI cards", async ({ page }) => {
    await navigateTo(page, "/dashboard/student");

    await expect(page.getByText("Attendance Rate")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Average Grade")).toBeVisible();
    await expect(page.getByText("Unread Messages")).toBeVisible();
  });

  // "Due Soon" went with the same removal — it was a grade's date relabelled a due date.
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

    // Was `.ant-tag`. Ant Design is gone from this repo, so that selector matched zero
    // elements and the loop below asserted nothing — a test that could never fail.
    // Grade letters render inside <StatusBadge>, which carries data-slot="status-badge".
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
