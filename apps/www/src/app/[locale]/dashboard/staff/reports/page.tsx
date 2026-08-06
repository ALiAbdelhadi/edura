import { CenterStaffReportsScreen } from "@/features/admin/center-staff-reports-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("reports");

export default function Page() {
  return <CenterStaffReportsScreen />;
}
