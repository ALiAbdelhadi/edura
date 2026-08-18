import { StudentWalletScreen } from "@/features/student/student-wallet-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("wallet");

export default function StudentWalletPage() {
  return <StudentWalletScreen />;
}
