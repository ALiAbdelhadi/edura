import { test, expect } from "@playwright/test";
import { login } from "./helpers";

const CASES = [
  { role: "student" as const, forbidden: "/en/dashboard/admin/students", ownPortal: "/en/dashboard/student" },
  { role: "teacher" as const, forbidden: "/en/dashboard/admin/fees", ownPortal: "/en/dashboard/teacher" },
  { role: "parent" as const, forbidden: "/en/dashboard/teacher/grades", ownPortal: "/en/dashboard/parent" },
];

test.describe("Portal boundary", () => {
  for (const { role, forbidden, ownPortal } of CASES) {
    test(`${role} reaching ${forbidden} is sent to their own portal`, async ({ page }) => {
      await login(page, role);

      await page
        .goto(forbidden, { waitUntil: "commit" })
        .catch((e: Error) => {
          if (!/ERR_ABORTED/.test(e.message)) throw e;
        });

      await page.waitForURL(`**${ownPortal}`, {
        timeout: 15_000,
        waitUntil: "commit",
      });
      expect(page.url()).not.toContain(forbidden.replace("/en", ""));
    });
  }

  test("a signed-out visitor reaching a portal is sent to login, not to a portal", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/en/dashboard/teacher", { waitUntil: "domcontentloaded" });

    await page.waitForURL(/\/login/, { timeout: 15_000, waitUntil: "commit" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  });
});
