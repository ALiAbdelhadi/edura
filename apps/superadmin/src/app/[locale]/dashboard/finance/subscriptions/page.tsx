import { SubscriptionsScreen } from "@/features/subscriptions/subscriptions-screen";

export const metadata = { title: "Subscriptions | Edura Back-office" };

export default function FinanceSubscriptionsPage() {
  return <SubscriptionsScreen apiBase="finance" />;
}
