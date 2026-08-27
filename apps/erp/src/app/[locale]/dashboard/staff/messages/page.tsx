import { ChatScreen } from "@/features/messaging/chat-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("messages");

export default function MessagesPage() {
  return <ChatScreen />;
}
