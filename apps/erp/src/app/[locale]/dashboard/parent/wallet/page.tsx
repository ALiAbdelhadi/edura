import { notFound } from "next/navigation";
import { ParentWalletScreen } from "@/features/parent/parent-wallet-screen";
import { WALLET_ENABLED } from "@/lib/config/features";

export default function Page() {
  if (!WALLET_ENABLED) notFound();
  return <ParentWalletScreen />;
}
