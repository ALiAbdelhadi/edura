import { StudentAttendanceScreen } from "@/features/student/student-attendance-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("attendance");

export default function Page() {
  return <StudentAttendanceScreen />;
}
