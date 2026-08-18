import { CenterStaffPortalHome } from "@/features/admin/center-staff-portal-home";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("overview");

export default function Page() {
  return <CenterStaffPortalHome />;
}
