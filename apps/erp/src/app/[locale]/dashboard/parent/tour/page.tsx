import { notFound } from "next/navigation";
import { ParentEmulator } from "@/features/parent/emulator/parent-emulator";
import { WALLET_ENABLED } from "@/lib/config/features";

export default function Page() {
  if (!WALLET_ENABLED) notFound();
  return <ParentEmulator />;
}
