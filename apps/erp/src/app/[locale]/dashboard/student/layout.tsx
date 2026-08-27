import { requirePortal } from "@/lib/auth/portal-gate";
import { AnalyticsIdentity } from "@/lib/observability/analytics-identity";
import PortalChrome from "./portal-chrome";

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const actor = await requirePortal("student", locale);
  return (
    <>
      <AnalyticsIdentity
        session={{ id: actor.id, role: actor.role, centerId: actor.centerId ?? null }}
      />
      <PortalChrome>{children}</PortalChrome>
    </>
  );
}
