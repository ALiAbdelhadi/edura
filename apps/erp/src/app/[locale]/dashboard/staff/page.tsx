import { CenterStaffPortalHome } from "@/features/admin/center-staff-portal-home";
import { requirePortal } from "@/lib/auth/portal-gate";
import { ForbiddenError } from "@/lib/errors/classes";
import { localizedTitle } from "@/lib/i18n/page-metadata";
import { getStaffMe } from "@/lib/services/center/staff";
import { redirect } from "next/navigation";

export const generateMetadata = localizedTitle("overview");

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requirePortal("center_staff", locale);

  let me;
  try {
    me = await getStaffMe(user);
  } catch (err) {
    if (err instanceof ForbiddenError) redirect(`/${locale}/login`);
    throw err;
  }

  return <CenterStaffPortalHome role={me.role} centerName={me.centerName} />;
}
