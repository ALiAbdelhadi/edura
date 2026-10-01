import { PortalIntl } from "@/components/i18n/portal-intl";
import { requirePortal } from "@/lib/auth/portal-gate";
import { AnalyticsIdentity } from "@/lib/observability/analytics-identity";
import { ServiceError, serviceGet } from "@/lib/server/service-fetch";
import { type StaffMe, STAFF_ME_PATH } from "@/lib/server/staff-me";
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

  const me = await serviceGet<StaffMe>(STAFF_ME_PATH);
  if (me.status === 403) redirect(`/${locale}/login`);
  if (!me.data) throw new ServiceError(me.status, STAFF_ME_PATH);
  const staffRole = me.data.role;

  return (
    <PortalIntl portal="staff">
      <AnalyticsIdentity
        session={{ id: actor.id, role: actor.role, centerId: actor.centerId ?? null }}
      />
      <PortalChrome staffRole={staffRole}>{children}</PortalChrome>
    </PortalIntl>
  );
}
