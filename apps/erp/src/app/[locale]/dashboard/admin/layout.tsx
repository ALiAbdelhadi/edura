import { requirePortal } from "@/lib/auth/portal-gate";
import { AnalyticsIdentity } from "@/lib/observability/analytics-identity";
import { PortalIntl } from "@/components/i18n/portal-intl";
import PortalChrome from "./portal-chrome";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const actor = await requirePortal("center_admin", locale);
  return (
    <PortalIntl portal="admin">
      <AnalyticsIdentity
        session={{ id: actor.id, role: actor.role, centerId: actor.centerId ?? null }}
      />
      <PortalChrome>{children}</PortalChrome>
    </PortalIntl>
  );
}
