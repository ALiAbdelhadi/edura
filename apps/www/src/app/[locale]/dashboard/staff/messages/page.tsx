import { ChatScreen } from "@/features/messaging/chat-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("messages");

// Center staff share the SAME screen as every other role. Their reach is
// narrowed server-side by their preset sub-role (receptionist → families,
// manager → the whole center scope, center_accountant → nobody), so the UI
// needs no staff-specific branching.
export default function MessagesPage() {
  return <ChatScreen />;
}
