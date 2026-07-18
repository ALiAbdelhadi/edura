import { PaymentIntentsScreen } from "@/features/payments/payment-intents-screen";

export const metadata = { title: "Online Payments | Edura Back-office" };

export default function SuperadminPaymentsPage() {
  return <PaymentIntentsScreen apiBase="admin" />;
}
