import { redirect } from "next/navigation";
import { isOnboardingComplete } from "@/lib/services/catalog/onboarding";
import { portalForRole, type PortalRole } from "./portal";
import { getSessionUser, type SessionUser } from "./session";

/**
 * THE server-side entry gate for every portal in this app.
 *
 * It replaces three client components that each decided the same question one
 * render too late: `/dashboard`'s router (spinner, then `fetch /api/v1/me`),
 * `RoleGuard` (a second `/api/v1/me`, behind a full-screen "Loading…"), and
 * `OnboardingGate`, which rendered the ENTIRE portal and only then fetched
 * `/api/v1/me/onboarding` and redirected. A first-run student was shown a
 * spinner, a loading screen, a dashboard they were not entitled to see yet,
 * and finally the wizard — four screens and seven sequential round trips to
 * answer questions the server already knew the answers to.
 *
 * Running here means the decision happens BEFORE any HTML is streamed: a user
 * who must onboard never sees the portal at all, and one who may see it gets
 * it in the first paint with no redirect after it.
 *
 * Ordering is the behaviour, so it is fixed: identity, then role, then
 * onboarding. Checking onboarding first would query a profile for a visitor
 * who turns out to be signed out.
 *
 * Cost: one indexed lookup by user id, and none at all for parent, assistant
 * and center_staff, who have no onboarding flow. It replaces two full HTTP
 * round trips from the browser.
 */
export async function requirePortal(
  role: PortalRole,
  locale: string,
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);

  const target = portalForRole(user.role);
  // A role www does not host (super_admin, accountant) has no portal to send
  // it to — never guess one; the back office is a different app.
  if (!target) redirect(`/${locale}/login`);
  if (user.role !== role) redirect(`/${locale}${target}`);

  if (!(await isOnboardingComplete(user))) redirect(`/${locale}/onboarding`);

  return user;
}

/**
 * Where `/dashboard` sends the caller. Same authority as `requirePortal` —
 * the server session and `portalForRole`, never a cached client value. The
 * loop this pairing was written to kill is proved in
 * tests/unit/account-switch-routing.test.ts.
 */
export async function resolvePortalEntry(locale: string): Promise<string> {
  const user = await getSessionUser();
  const target = portalForRole(user?.role);
  if (!user || !target) return `/${locale}/login`;
  if (!(await isOnboardingComplete(user))) return `/${locale}/onboarding`;
  return `/${locale}${target}`;
}
