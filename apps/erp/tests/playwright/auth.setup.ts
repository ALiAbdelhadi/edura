/**
 * Sign in ONCE per role and save the session, so specs that merely need to BE
 * someone do not pay for a login each time.
 *
 * WHY THIS EXISTS AT ALL — it is a rate limit, not an optimisation.
 * `apps/erp/src/lib/auth/auth.ts:174` sets better-auth's
 * `rateLimit.customRules["/sign-in/email"] = { window: 60, max: 20 }`: twenty
 * sign-ins per minute per IP. Measured against the dev server, attempts 1-19
 * return 200 and attempt 20 returns HTTP 429. `navigation.spec.ts` signs in
 * before every one of its 26 tests, so it could never complete a pass — and the
 * failure does not look like a limit, because better-auth's built-in limiter
 * answers with a message the login page does not recognise, so the screen says
 * "Invalid email or password". With these four states it costs four logins for
 * the whole file instead of twenty-six.
 *
 * `auth.spec.ts` deliberately does NOT use these: signing in is what it tests.
 */
import { test as setup } from "@playwright/test";
import { login, STORAGE_STATE, type Role } from "./helpers";

const ROLES: Role[] = ["admin", "teacher", "student", "parent"];

for (const role of ROLES) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    // 90s: cold compile of this role's portal, once per run. See helpers.login.
    await login(page, role, 90_000);
    await page.context().storageState({ path: STORAGE_STATE[role] });
  });
}
