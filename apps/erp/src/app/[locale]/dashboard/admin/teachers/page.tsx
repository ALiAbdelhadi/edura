import { AdminTeachersScreen } from "@/features/admin/admin-teachers-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("teachers");

export default function Page() {
  return <AdminTeachersScreen />;
}
