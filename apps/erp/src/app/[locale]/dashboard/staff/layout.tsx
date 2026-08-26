import { redirect } from "next/navigation";
import { requirePortal } from "@/lib/auth/portal-gate";
import { AnalyticsIdentity } from "@/lib/observability/analytics-identity";
import { ForbiddenError } from "@/lib/errors/classes";
import { getStaffMe } from "@/lib/services/center/staff";
import PortalChrome from "./portal-chrome";

/**
 * The gate runs on the SERVER, before a byte of this portal is streamed — see
 * lib/auth/portal-gate.ts for what it replaces.
 *
 * This portal resolves one more thing here: the staff member's preset sub-role,
 * which decides their nav. That used to be a `fetch("center/staff/me")` in a
 * client effect behind a full-screen "Loading…", so every staff navigation
 * showed that screen before showing the portal. Reading it here removes the
 * screen and the round trip, and keeps the property the effect was written for:
 * it is a LIVE, revocation-aware resolve, so a deactivated staff account has no
 * active link, `getStaffMe` throws, and they are sent to login on THIS request
 * rather than at the session's expiry.
 *
 * The API is still the real security gate (default-closed center-actor); the
 * nav filtering this feeds is UX only.
 */
export default async function StaffLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const actor = await requirePortal("center_staff", locale);

  let staffRole;
  try {
    staffRole = (await getStaffMe(actor)).role;
  } catch (err) {
    if (err instanceof ForbiddenError) redirect(`/${locale}/login`);
    throw err;
  }

  return (
    <>
      <AnalyticsIdentity
        session={{ id: actor.id, role: actor.role, centerId: actor.centerId ?? null }}
      />
      <PortalChrome staffRole={staffRole}>{children}</PortalChrome>
    </>
  );
}
