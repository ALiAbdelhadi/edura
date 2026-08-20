import { requirePortal } from "@/lib/auth/portal-gate";
import PortalChrome from "./portal-chrome";

/**
 * The gate runs on the SERVER, before a byte of this portal is streamed.
 *
 * It replaces `<RoleGuard>` and `<OnboardingGate>`, which both answered from
 * the browser one render too late: the guard behind a full-screen "Loading…",
 * and the onboarding gate only AFTER painting the whole portal to someone who
 * was not entitled to see it yet. See lib/auth/portal-gate.ts.
 *
 * `requirePortal` redirects rather than returning a rejected caller, so
 * everything below it renders for a parent whose onboarding is done.
 */
export default async function ParentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requirePortal("parent", locale);
  return <PortalChrome>{children}</PortalChrome>;
}
