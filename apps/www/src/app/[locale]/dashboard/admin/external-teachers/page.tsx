import { ExternalTeachersScreen } from "@/features/admin/external-teachers-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("externalTeachers");

export default function Page() {
  return <ExternalTeachersScreen />;
}
