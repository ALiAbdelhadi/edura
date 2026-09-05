import { localizedTitle } from "@/lib/i18n/page-metadata";
import { NotificationsHistoryScreen } from "@/features/admin/notifications-history-screen";

export const generateMetadata = localizedTitle("notificationLog");

export default function SuperadminNotificationLogPage() {
  return <NotificationsHistoryScreen />;
}
