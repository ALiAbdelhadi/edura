import { ChatScreen } from "@/features/messaging/chat-screen";

export const metadata = { title: "Messages | Edura" };

// Messaging is the assistant's primary job — the portal opens straight on it.
export default function AssistantHomePage() {
  return <ChatScreen />;
}
