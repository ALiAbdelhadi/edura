import { TeacherWalletScreen } from "@/features/teacher/teacher-wallet-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("wallet");

export default function TeacherWalletPage() {
  return <TeacherWalletScreen />;
}
