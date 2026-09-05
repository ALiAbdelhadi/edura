import { localizedTitle } from "@/lib/i18n/page-metadata";
import { StudentsScreen } from "@/features/admin/students-screen";

export const generateMetadata = localizedTitle("students");

export default function SuperadminStudentsPage() {
  return <StudentsScreen />;
}
