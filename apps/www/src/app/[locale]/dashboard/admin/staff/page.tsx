import { CenterStaffScreen } from "@/features/admin/center-staff-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("staff");

// Owner-only staff management (create/role/deactivate). The API is gated to
// center_admin — staff can never reach it (hard exclusion #4).
export default function Page() {
  return <CenterStaffScreen />;
}
