/**
 * The portal boundary — can a signed-in user reach a portal they do not own?
 *
 * Revived 2026-08-27. Analysis: docs/testing/playwright-revival-analysis.md
 *
 * WHAT THIS NOW COVERS THAT IT DID NOT BEFORE. When these tests were written the
 * gate was CLIENT-side (`RoleGuard`, deciding after a `fetch /api/v1/me`, behind
 * a full-screen "Loading…"). It is now `requirePortal` in
 * lib/auth/portal-gate.ts, which runs on the server BEFORE a byte is streamed.
 * So this is the browser-level proof that the server gate holds.
 *
 * TWO CHANGES OF SUBSTANCE:
 *
 *   * `waitForTimeout(3_000)` then `expect(url).not.toContain(...)` is gone. It
 *     was slow, flaky, and weak — "not the forbidden URL" also passes if the app
 *     lands on an error page, a blank screen, or the login form. The gate
 *     redirects a wrong-role caller to THEIR OWN portal
 *     (`portal-gate.ts:41` → `portalForRole`), so that is what is asserted.
 *
 *   * The two sidebar tests are DELETED, not re-pointed. They asserted a flat
 *     `.ant-menu` containing "Overview" / "Students" / "Teachers"; the sidebar-ia
 *     pass replaced that with labelled groups, so the IA they describe no longer
 *     exists. Re-pointing the selector would have produced a test that passes
 *     against markup nobody designed. The redirect tests below already prove the
 *     boundary those two were gesturing at, and they prove it server-side.
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/** Each case: who signs in, what they reach for, and the portal they own. */
const CASES = [
  { role: "student" as const, forbidden: "/en/dashboard/admin/students", ownPortal: "/en/dashboard/student" },
  { role: "teacher" as const, forbidden: "/en/dashboard/admin/fees", ownPortal: "/en/dashboard/teacher" },
  { role: "parent" as const, forbidden: "/en/dashboard/teacher/grades", ownPortal: "/en/dashboard/parent" },
];

test.describe("Portal boundary", () => {
  for (const { role, forbidden, ownPortal } of CASES) {
    test(`${role} reaching ${forbidden} is sent to their own portal`, async ({ page }) => {
      await login(page, role);

      // `waitUntil: "commit"`, and the abort is tolerated ON PURPOSE: the server
      // gate redirects while this navigation is still in flight, which
      // supersedes it and surfaces as net::ERR_ABORTED. That abort IS the
      // boundary doing its job — it is not the assertion, and swallowing it
      // hides nothing, because the two assertions below prove where the browser
      // actually ended up.
      await page
        .goto(forbidden, { waitUntil: "commit" })
        .catch((e: Error) => {
          if (!/ERR_ABORTED/.test(e.message)) throw e;
        });

      // Positive: the exact destination, not merely "somewhere else" — "not the
      // forbidden URL" would also pass on an error page or a blank screen.
      //
      // `waitUntil: "commit"` for the same reason as helpers.login: the default
      // waits for "load" on the destination, and under `next dev` that portal
      // may still be compiling. Measured in CI: this exact line was two of the
      // three flakes in the first run of the e2e-playwright job. The question is
      // where the gate SENT the browser, which "commit" answers.
      await page.waitForURL(`**${ownPortal}`, {
        timeout: 15_000,
        waitUntil: "commit",
      });
      // Negative: and the forbidden portal was never reached.
      expect(page.url()).not.toContain(forbidden.replace("/en", ""));
    });
  }

  test("a signed-out visitor reaching a portal is sent to login, not to a portal", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/en/dashboard/teacher", { waitUntil: "domcontentloaded" });

    await page.waitForURL(/\/login/, { timeout: 15_000, waitUntil: "commit" });
    // The heading assertion still auto-waits, so "commit" costs no rigour here.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  });
});
