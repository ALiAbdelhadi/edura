import { localizedTitle } from "@/lib/i18n/page-metadata";
import { TransactionsScreen } from "@/features/finance/transactions-screen";

export const generateMetadata = localizedTitle("transactions");

export default function FinanceTransactionsPage() {
  return <TransactionsScreen />;
}
