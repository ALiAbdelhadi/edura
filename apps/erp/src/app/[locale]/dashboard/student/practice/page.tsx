import { notFound } from "next/navigation";
import { StudentEmulator } from "@/features/student/emulator/student-emulator";
import { WALLET_ENABLED } from "@/lib/config/features";

export default function Page() {
  if (!WALLET_ENABLED) notFound();
  return <StudentEmulator />;
}
