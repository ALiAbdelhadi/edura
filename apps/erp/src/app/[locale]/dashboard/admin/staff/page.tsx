import { CenterStaffScreen } from "@/features/admin/center-staff-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("staff");

export default function Page() {
  return <CenterStaffScreen />;
}
