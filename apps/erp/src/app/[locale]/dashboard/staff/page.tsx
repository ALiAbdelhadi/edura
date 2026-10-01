import { CenterStaffPortalHome } from "@/features/admin/center-staff-portal-home";
import { requirePortal } from "@/lib/auth/portal-gate";
import { localizedTitle } from "@/lib/i18n/page-metadata";
import { ServiceError, serviceGet } from "@/lib/server/service-fetch";
import { type StaffMe, STAFF_ME_PATH } from "@/lib/server/staff-me";
import { redirect } from "next/navigation";

export const generateMetadata = localizedTitle("overview");

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requirePortal("center_staff", locale);

  const me = await serviceGet<StaffMe>(STAFF_ME_PATH);
  if (me.status === 403) redirect(`/${locale}/login`);
  if (!me.data) throw new ServiceError(me.status, STAFF_ME_PATH);

  return <CenterStaffPortalHome role={me.data.role} centerName={me.data.centerName} />;
}
