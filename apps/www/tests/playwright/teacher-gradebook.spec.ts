import { test, expect } from "@playwright/test";
import { login, navigateTo, waitForTableLoad } from "./helpers";

test.describe("Teacher Gradebook", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "teacher");
    await navigateTo(page, "/dashboard/teacher/grades");
  });

  test("loads with course selector and auto-selects first course", async ({ page }) => {
    await expect(page.getByText("Course:")).toBeVisible({ timeout: 15_000 });

    // A course should be auto-selected
    const selector = page.locator(".ant-select-selection-item");
    await expect(selector.first()).toBeVisible({ timeout: 10_000 });

    await expect(
      page.locator(".ant-card-head-title").filter({ hasText: "Gradebook" }),
    ).toBeVisible();
  });

  test("displays grade table or empty state", async ({ page }) => {
    await waitForTableLoad(page);

    const table = page.locator(".ant-table");
    const emptyMsg = page.getByText(/no grade entries|no students enrolled/i);

    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test("save button disabled when no edits", async ({ page }) => {
    await waitForTableLoad(page);

    const saveBtn = page.getByRole("button", { name: /save grades/i });
    if (await saveBtn.isVisible().catch(() => false)) {
      await expect(saveBtn).toBeDisabled();
    }
  });

  test("editing a grade enables save and shows discard", async ({ page }) => {
    await waitForTableLoad(page);

    const gradeInput = page.locator(".ant-table .ant-input").first();
    if (await gradeInput.isVisible().catch(() => false)) {
      await gradeInput.fill("95");

      const saveBtn = page.getByRole("button", { name: /save grades/i });
      await expect(saveBtn).toBeEnabled({ timeout: 5_000 });

      const discardBtn = page.getByRole("button", { name: /discard/i });
      await expect(discardBtn).toBeVisible();

      // Clicking discard reverts
      await discardBtn.click();
      await expect(saveBtn).toBeDisabled({ timeout: 5_000 });
    }
  });

  test("switching courses clears edited grades", async ({ page }) => {
    await waitForTableLoad(page);

    const gradeInput = page.locator(".ant-table .ant-input").first();
    if (await gradeInput.isVisible().catch(() => false)) {
      await gradeInput.fill("99");

      // Switch course
      const courseSelect = page.locator(".ant-select").first();
      await courseSelect.click();

      const options = page.locator(".ant-select-item-option");
      if ((await options.count()) > 1) {
        await options.nth(1).click();

        // Discard should vanish (edits cleared)
        await expect(
          page.getByRole("button", { name: /discard/i }),
        ).not.toBeVisible({ timeout: 5_000 });
      }
    }
  });
});
