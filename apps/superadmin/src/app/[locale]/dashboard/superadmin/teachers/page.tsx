import { localizedTitle } from "@/lib/i18n/page-metadata";
import { TeachersScreen } from "@/features/admin/teachers-screen";

export const generateMetadata = localizedTitle("teachers");

export default function SuperadminTeachersPage() {
  return <TeachersScreen />;
}
