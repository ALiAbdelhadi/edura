import { localizedTitle } from "@/lib/i18n/page-metadata";
import { PaymentIntentsScreen } from "@/features/payments/payment-intents-screen";

export const generateMetadata = localizedTitle("payments");

export default function SuperadminPaymentsPage() {
  return <PaymentIntentsScreen apiBase="admin" />;
}
