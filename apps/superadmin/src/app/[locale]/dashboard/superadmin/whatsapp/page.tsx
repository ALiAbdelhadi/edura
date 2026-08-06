import { localizedTitle } from "@/lib/i18n/page-metadata";
import { WhatsAppMessagesScreen } from "@/features/admin/whatsapp-messages-screen";

export const generateMetadata = localizedTitle("whatsapp");

export default function SuperadminWhatsAppPage() {
  return <WhatsAppMessagesScreen />;
}
