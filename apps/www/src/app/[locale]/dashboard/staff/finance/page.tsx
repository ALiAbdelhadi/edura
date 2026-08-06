import { CenterStaffFinanceScreen } from "@/features/admin/center-staff-finance-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("finance");

export default function Page() {
  return <CenterStaffFinanceScreen />;
}
