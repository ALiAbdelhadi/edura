import { PaymentIntentsScreen } from "@/features/payments/payment-intents-screen";

export const metadata = { title: "Online Payments | Edura Back-office" };

export default function FinancePaymentsPage() {
  return <PaymentIntentsScreen apiBase="finance" />;
}
