import { localizedTitle } from "@/lib/i18n/page-metadata";
import { MessagingScreen } from "@/features/admin/messaging-screen";

export const generateMetadata = localizedTitle("messaging");

export default function SuperadminMessagingPage() {
  return <MessagingScreen />;
}
