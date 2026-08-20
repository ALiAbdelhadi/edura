import { StudentSubjectsScreen } from "@/features/student/student-subjects-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("mySubjects");

export default function StudentSubjectsPage() {
  return <StudentSubjectsScreen />;
}
