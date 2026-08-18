import { CenterEmulator } from "@/features/admin/emulator/center-emulator";

/**
 * The permanent way back into the centre's guided tour — the same reasoning as
 * the teacher's `/dashboard/teacher/tour`: the first-run gate decides when the
 * emulator opens ITSELF, never whether it exists. An owner who skipped on day
 * one, or a new manager three months in, reaches it here with no flag to reset.
 */
export default function Page() {
  return <CenterEmulator />;
}
