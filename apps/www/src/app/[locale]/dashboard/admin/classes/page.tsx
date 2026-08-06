import { AdminClassesScreen } from "@/features/admin/admin-classes-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("classes");

export default function Page() {
  return <AdminClassesScreen />;
}
