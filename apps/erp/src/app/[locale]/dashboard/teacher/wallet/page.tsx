import { notFound } from "next/navigation";
import { TeacherWalletScreen } from "@/features/teacher/teacher-wallet-screen";
import { WALLET_ENABLED } from "@/lib/config/features";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("wallet");

export default function TeacherWalletPage() {
  if (!WALLET_ENABLED) notFound();
  return <TeacherWalletScreen />;
}
