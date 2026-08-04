import { TeacherTeamScreen } from "@/features/teacher/teacher-team-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("team");

export default function TeacherTeamPage() {
  return <TeacherTeamScreen />;
}
