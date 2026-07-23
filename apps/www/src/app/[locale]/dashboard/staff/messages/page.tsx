import { ChatScreen } from "@/features/messaging/chat-screen";

export const metadata = { title: "Messages | Edura" };

// Center staff share the SAME screen as every other role. Their reach is
// narrowed server-side by their preset sub-role (receptionist → families,
// manager → the whole center scope, center_accountant → nobody), so the UI
// needs no staff-specific branching.
export default function MessagesPage() {
  return <ChatScreen />;
}
