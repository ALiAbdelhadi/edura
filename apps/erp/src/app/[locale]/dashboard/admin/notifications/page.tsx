import { NotificationsScreen } from "@/features/notifications/notifications-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("notifications");

export default function Page() {
  return <NotificationsScreen />;
}
