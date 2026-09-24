import { PortalIntl } from "@/components/i18n/portal-intl";
import { requirePortal } from "@/lib/auth/portal-gate";
import { ForbiddenError } from "@/lib/errors/classes";
import { AnalyticsIdentity } from "@/lib/observability/analytics-identity";
import { getStaffMe } from "@/lib/services/center/staff";
import { redirect } from "next/navigation";
import PortalChrome from "./portal-chrome";

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
    <PortalIntl portal="staff">
      <AnalyticsIdentity
        session={{ id: actor.id, role: actor.role, centerId: actor.centerId ?? null }}
      />
      <PortalChrome staffRole={staffRole}>{children}</PortalChrome>
    </PortalIntl>
  );
}
