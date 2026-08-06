import { localizedTitle } from "@/lib/i18n/page-metadata";
import { NotificationsScreen } from "@/features/notifications/notifications-screen";

export const generateMetadata = localizedTitle("notifications");
export default function Page() { return <NotificationsScreen portal="superadmin" />; }
