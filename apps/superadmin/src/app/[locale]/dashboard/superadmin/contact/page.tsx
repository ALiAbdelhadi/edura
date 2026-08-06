import { localizedTitle } from "@/lib/i18n/page-metadata";
import { ContactInboxScreen } from "@/features/admin/contact-inbox-screen";

export const generateMetadata = localizedTitle("contactInbox");

export default function ContactInboxPage() {
  return <ContactInboxScreen />;
}
