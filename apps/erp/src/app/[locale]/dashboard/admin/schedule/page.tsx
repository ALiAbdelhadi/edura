import { AdminScheduleScreen } from "@/features/admin/admin-schedule-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("schedule");

export default function Page() {
  return <AdminScheduleScreen />;
}
