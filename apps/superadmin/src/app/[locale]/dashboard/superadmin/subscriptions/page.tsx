import { SubscriptionsScreen } from "@/features/subscriptions/subscriptions-screen";

export const metadata = { title: "Subscriptions | Edura Back-office" };

export default function SuperadminSubscriptionsPage() {
  return <SubscriptionsScreen apiBase="admin" />;
}
