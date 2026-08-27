import { test, expect, type Page } from "@playwright/test";
import { navigateTo, STORAGE_STATE, type Role } from "./helpers";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !/favicon|manifest|sw\.js|status of 40[14]/i.test(e));
}

const PORTALS: Array<{ role: Role; paths: string[] }> = [
  {
    role: "student",
    paths: [
      "/dashboard/student",
      "/dashboard/student/schedule",
      "/dashboard/student/grades",
      "/dashboard/student/attendance",
      "/dashboard/student/materials",
      "/dashboard/student/notifications",
    ],
  },
  {
    role: "teacher",
    paths: [
      "/dashboard/teacher",
      "/dashboard/teacher/classes",
      "/dashboard/teacher/grades",
      "/dashboard/teacher/materials",
      "/dashboard/teacher/notifications",
    ],
  },
  {
    role: "admin",
    paths: [
      "/dashboard/admin",
      "/dashboard/admin/students",
      "/dashboard/admin/teachers",
      "/dashboard/admin/classes",
      "/dashboard/admin/fees",
      "/dashboard/admin/rooms",
      "/dashboard/admin/enrollment-requests",
      "/dashboard/admin/reports",
      "/dashboard/admin/notifications",
    ],
  },
  {
    role: "parent",
    paths: [
      "/dashboard/parent",
      "/dashboard/parent/progress",
      "/dashboard/parent/children",
      "/dashboard/parent/fees",
      "/dashboard/parent/attendance",
      "/dashboard/parent/notifications",
    ],
  },
];

for (const { role, paths } of PORTALS) {
  test.describe(`${role} pages`, () => {
    test.use({ storageState: STORAGE_STATE[role] });

    for (const path of paths) {
      test(path, async ({ page }) => {
        const errors = collectErrors(page);

        await navigateTo(page, path);

        expect(page.url(), `${role} was redirected away from ${path}`).toContain(
          `/en${path}`,
        );

        const content = page.locator('[data-slot="portal-content"]');
        await expect(content).toBeVisible();
        await expect
          .poll(async () => (await content.innerText()).trim().length, {
            timeout: 15_000,
            message: `${path} rendered an empty content region`,
          })
          .toBeGreaterThan(0);

        expect(realErrors(errors), `${path} console errors`).toEqual([]);
      });
    }
  });
}
