import { TeacherEmulator } from "@/features/teacher/emulator/teacher-emulator";

/**
 * The permanent way back into the guided tour.
 *
 * The first-run gate decides when the emulator opens ITSELF; it must never
 * decide whether the emulator exists. A teacher who skipped on day one — or who
 * comes back in October having forgotten how a lesson is closed — reaches it
 * here, with no flag to reset and nothing to ask support for.
 *
 * No `onDone`: nothing to dismiss on a page the teacher navigated to on purpose.
 */
export default function Page() {
  return <TeacherEmulator />;
}
