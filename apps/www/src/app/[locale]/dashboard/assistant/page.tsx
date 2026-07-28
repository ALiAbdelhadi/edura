import { ChatScreen } from "@/features/messaging/chat-screen";
import { TeamNotesBoard } from "@/features/team-notes/team-notes-board";

export const metadata = { title: "Messages | Edura" };

// Messaging is the assistant's primary job — the portal opens straight on it,
// with the team's to-do notes pinned above (the assistant↔assistant/teacher
// coordination surface; full board at /dashboard/assistant/notes).
export default function AssistantHomePage() {
  return (
    <div className="flex flex-col gap-4">
      <TeamNotesBoard compact />
      <ChatScreen />
    </div>
  );
}
