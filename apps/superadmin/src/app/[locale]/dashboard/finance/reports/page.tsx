import { localizedTitle } from "@/lib/i18n/page-metadata";
import { FinanceReportsScreen } from "@/features/finance/reports-screen";

export const generateMetadata = localizedTitle("reports");

export default function FinanceReportsPage() {
  return <FinanceReportsScreen />;
}
