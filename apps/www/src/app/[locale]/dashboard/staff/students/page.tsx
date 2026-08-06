import { AdminStudentsScreen } from "@/features/admin/admin-students-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("students");

export default function Page() {
  return <AdminStudentsScreen />;
}
