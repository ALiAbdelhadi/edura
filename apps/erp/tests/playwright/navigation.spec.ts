/**
 * Route smoke sweep — does every portal page actually load, for the role that
 * owns it?
 *
 * Rewritten 2026-08-27. Analysis: docs/testing/playwright-revival-analysis.md
 *
 * THE OLD ASSERTION WAS `expect(page.locator(".ant-alert-error")).toHaveCount(0)`,
 * ONCE PER TEST, AND IT WAS THE ONLY ONE. AntD has been gone since the shadcn
 * migration, so that selector matches zero elements and the expectation is
 * trivially true — all 26 tests asserted nothing whatsoever. Re-pointing the
 * selector would have preserved that: `[data-slot="alert"]` count 0 is just as
 * true on a page that never rendered. The assertions below are new work, not a
 * rename.
 *
 * WHAT EACH TEST NOW PROVES, and why each is load-bearing:
 *
 *   1. THE ROLE COULD REACH IT — the URL is still the requested path. The server
 *      gate (`requirePortal`) bounces a caller to their own portal, to
 *      /onboarding, or to /login, and every one of those bounces still renders a
 *      perfectly healthy page. Without this, a suite of redirects passes as a
 *      suite of working screens.
 *   2. THE SCREEN RENDERED, not merely the shell — the portal content region is
 *      present (navigateTo waits for it) AND is not empty. An empty region is
 *      what a crashed screen inside a working layout looks like.
 *   3. NOTHING THREW — no uncaught page error and no console error, which is the
 *      "without errors" this file's title has always claimed and never checked.
 *      Filtered the same way as render-gates.spec.ts: optional-asset 404s and
 *      401s from optional probes are noise, hydration and identity failures are
 *      not.
 *
 * SESSIONS COME FROM auth.setup.ts, NOT FROM LOGGING IN HERE. Signing in 26
 * times would blow the 20-per-minute sign-in rate limit; see that file.
 *
 * THE ROUTE LISTS ARE THE ORIGINAL ONES, deliberately. Every path here still
 * exists, but each portal has gained screens since they were written (student
 * /subjects /reviews /wallet /subscriptions /id /messages; teacher /attendance
 * /door /wallet /centers /team; admin /counter /checkin /collaborations
 * /expenses /external-teachers /staff /audit; parent /pay /wallet /oversight
 * /subscriptions). Widening the sweep is a separate decision — several of those
 * need seeded data this database does not have.
 */
import { test, expect, type Page } from "@playwright/test";
import { navigateTo, STORAGE_STATE, type Role } from "./helpers";

/** Console/page errors worth failing on. Mirrors render-gates.spec.ts. */
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

        // 1. Reached, not redirected. `/en` is prepended by the locale
        //    middleware; anything else means a gate sent this role elsewhere.
        expect(page.url(), `${role} was redirected away from ${path}`).toContain(
          `/en${path}`,
        );

        // 2. The screen rendered inside the shell, and rendered something.
        const content = page.locator('[data-slot="portal-content"]');
        await expect(content).toBeVisible();
        await expect
          .poll(async () => (await content.innerText()).trim().length, {
            timeout: 15_000,
            message: `${path} rendered an empty content region`,
          })
          .toBeGreaterThan(0);

        // 3. Nothing threw on the way.
        expect(realErrors(errors), `${path} console errors`).toEqual([]);
      });
    }
  });
}
