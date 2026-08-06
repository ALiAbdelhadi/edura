import { AdminDashboard } from "@/features/admin/admin-dashboard";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("overview");

export default function Page() {
  return <AdminDashboard />;
}
