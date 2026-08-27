import { AdminCheckinScreen } from "@/features/admin/admin-checkin-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("checkin");

export default function Page() {
  return <AdminCheckinScreen />;
}
