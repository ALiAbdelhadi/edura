import { AdminFeesScreen } from "@/features/admin/admin-fees-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("fees");

export default function Page() {
  return <AdminFeesScreen />;
}
