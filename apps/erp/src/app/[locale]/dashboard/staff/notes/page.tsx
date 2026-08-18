import { TeamNotesBoard } from "@/features/team-notes/team-notes-board";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("teamNotes");

export default function StaffTeamNotesPage() {
  return <TeamNotesBoard />;
}
