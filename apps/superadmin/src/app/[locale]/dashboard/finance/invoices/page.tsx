import { localizedTitle } from "@/lib/i18n/page-metadata";
import { InvoicesScreen } from "@/features/finance/invoices-screen";

export const generateMetadata = localizedTitle("invoices");

export default function FinanceInvoicesPage() {
  return <InvoicesScreen />;
}
