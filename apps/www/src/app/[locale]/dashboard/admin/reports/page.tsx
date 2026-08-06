import { AdminReportsScreen } from "@/features/admin/admin-reports-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("reports");

export default function Page() {
  return <AdminReportsScreen />;
}
