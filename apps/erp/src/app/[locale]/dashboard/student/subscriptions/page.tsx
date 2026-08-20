import { StudentSubscriptionsScreen } from "@/features/student/student-subscriptions-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("subscriptions");

export default function StudentSubscriptionsPage() {
  return <StudentSubscriptionsScreen />;
}
