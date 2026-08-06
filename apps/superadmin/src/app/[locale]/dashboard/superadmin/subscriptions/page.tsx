import { localizedTitle } from "@/lib/i18n/page-metadata";
import { SubscriptionsScreen } from "@/features/subscriptions/subscriptions-screen";

export const generateMetadata = localizedTitle("subscriptions");

export default function SuperadminSubscriptionsPage() {
  return <SubscriptionsScreen apiBase="admin" />;
}
