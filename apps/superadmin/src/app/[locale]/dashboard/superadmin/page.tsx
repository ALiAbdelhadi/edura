import { localizedTitle } from "@/lib/i18n/page-metadata";
import { SuperAdminDashboard } from "@/features/admin/super-admin-dashboard";

export const generateMetadata = localizedTitle("overview");
export default function Page() {
  return <SuperAdminDashboard />;
}
