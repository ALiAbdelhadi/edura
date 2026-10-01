import type { SessionUser } from "@repo/server-core/auth/types";
import { redirect } from "next/navigation";
import { ssrSession } from "@/lib/server/ssr-session";
import { portalForRole, type PortalRole } from "./portal";

export async function requirePortal(role: PortalRole, locale: string): Promise<SessionUser> {
  const { user, onboardingComplete } = await ssrSession();
  if (!user) redirect(`/${locale}/login`);
  const target = portalForRole(user.role);
  if (!target) redirect(`/${locale}/login`);
  if (user.role !== role) redirect(`/${locale}${target}`);
  if (!onboardingComplete) redirect(`/${locale}/onboarding`);
  return user;
}

export async function resolvePortalEntry(locale: string): Promise<string> {
  const { user, onboardingComplete } = await ssrSession();
  const target = user ? portalForRole(user.role) : null;
  if (!user || !target) return `/${locale}/login`;
  if (!onboardingComplete) return `/${locale}/onboarding`;
  return `/${locale}${target}`;
}
