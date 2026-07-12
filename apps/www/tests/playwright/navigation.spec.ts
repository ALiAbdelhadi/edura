import { test, expect } from "@playwright/test";
import { login, navigateTo } from "./helpers";

test.describe("Navigation Smoke Tests — every page loads without errors", () => {
  test.describe("Student pages", () => {
    test.beforeEach(async ({ page }) => {
      await login(page, "student");
    });

    for (const path of [
      "/dashboard/student",
      "/dashboard/student/schedule",
      "/dashboard/student/grades",
      "/dashboard/student/attendance",
      "/dashboard/student/materials",
      "/dashboard/student/notifications",
    ]) {
      test(`${path}`, async ({ page }) => {
        await navigateTo(page, path);
        await expect(page.locator(".ant-alert-error")).toHaveCount(0);
      });
    }
  });

  test.describe("Teacher pages", () => {
    test.beforeEach(async ({ page }) => {
      await login(page, "teacher");
    });

    for (const path of [
      "/dashboard/teacher",
      "/dashboard/teacher/classes",
      "/dashboard/teacher/grades",
      "/dashboard/teacher/materials",
      "/dashboard/teacher/notifications",
    ]) {
      test(`${path}`, async ({ page }) => {
        await navigateTo(page, path);
        await expect(page.locator(".ant-alert-error")).toHaveCount(0);
      });
    }
  });

  test.describe("Admin pages", () => {
    test.beforeEach(async ({ page }) => {
      await login(page, "admin");
    });

    for (const path of [
      "/dashboard/admin",
      "/dashboard/admin/students",
      "/dashboard/admin/teachers",
      "/dashboard/admin/classes",
      "/dashboard/admin/fees",
      "/dashboard/admin/rooms",
      "/dashboard/admin/enrollment-requests",
      "/dashboard/admin/reports",
      "/dashboard/admin/notifications",
    ]) {
      test(`${path}`, async ({ page }) => {
        await navigateTo(page, path);
        await expect(page.locator(".ant-alert-error")).toHaveCount(0);
      });
    }
  });

  test.describe("Parent pages", () => {
    test.beforeEach(async ({ page }) => {
      await login(page, "parent");
    });

    for (const path of [
      "/dashboard/parent",
      "/dashboard/parent/progress",
      "/dashboard/parent/children",
      "/dashboard/parent/fees",
      "/dashboard/parent/attendance",
      "/dashboard/parent/notifications",
    ]) {
      test(`${path}`, async ({ page }) => {
        await navigateTo(page, path);
        await expect(page.locator(".ant-alert-error")).toHaveCount(0);
      });
    }
  });
});
