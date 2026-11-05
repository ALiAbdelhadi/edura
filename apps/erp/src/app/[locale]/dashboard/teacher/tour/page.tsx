import { notFound } from "next/navigation";
import { TeacherEmulator } from "@/features/teacher/emulator/teacher-emulator";
import { WALLET_ENABLED } from "@/lib/config/features";

export default function Page() {
  if (!WALLET_ENABLED) notFound();
  return <TeacherEmulator />;
}
