import { notFound } from "next/navigation";
import { StudentWalletScreen } from "@/features/student/student-wallet-screen";
import { WALLET_ENABLED } from "@/lib/config/features";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("wallet");

export default function StudentWalletPage() {
  if (!WALLET_ENABLED) notFound();
  return <StudentWalletScreen />;
}
