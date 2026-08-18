import { DoorCheckinScreen } from "@/features/attendance/door-checkin-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("doorCheckin");

export default function TeacherDoorPage() {
  return <DoorCheckinScreen />;
}
