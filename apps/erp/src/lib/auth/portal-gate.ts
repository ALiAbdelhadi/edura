import { redirect } from "next/navigation";
import { isOnboardingComplete } from "@/lib/services/catalog/onboarding";
import { portalForRole, type PortalRole } from "./portal";
import { getSessionUser, type SessionUser } from "./session";

export async function requirePortal(
  role: PortalRole,
  locale: string,
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);

  const target = portalForRole(user.role);
  if (!target) redirect(`/${locale}/login`);
  if (user.role !== role) redirect(`/${locale}${target}`);

  if (!(await isOnboardingComplete(user))) redirect(`/${locale}/onboarding`);

  return user;
}

export async function resolvePortalEntry(locale: string): Promise<string> {
  const user = await getSessionUser();
  const target = portalForRole(user?.role);
  if (!user || !target) return `/${locale}/login`;
  if (!(await isOnboardingComplete(user))) return `/${locale}/onboarding`;
  return `/${locale}${target}`;
}
