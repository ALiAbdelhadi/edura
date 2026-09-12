import { FindTeacherScreen } from "@/features/student/find-teacher-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("findTeacher");

export default function StudentFindTeacherPage() {
  return <FindTeacherScreen />;
}
