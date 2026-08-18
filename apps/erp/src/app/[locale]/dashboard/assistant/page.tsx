import { AssistantFirstRun } from "@/features/assistant/assistant-first-run";
import { ChatScreen } from "@/features/messaging/chat-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("messages");

/**
 * Messaging is the assistant's primary job, so the portal opens straight on it
 * and the nav's "Messages" entry points here rather than at a second address.
 *
 * The compact team-notes board used to sit above the chat; it came off with the
 * staff home's (Ali, 2026-08-10) for the same reason — `/notes` is its own nav
 * entry, so the board was the same section on the screen twice. One
 * consequence: listing the board is what registers a read receipt, so an
 * assistant's receipts now register when they open `/notes` rather than on
 * every visit here.
 */
export default function AssistantHomePage() {
  return (
    <>
      {/* First entry only: the guided tour offers itself once, then never again
          (user_prefs.tour_completed). It renders nothing afterwards, so it costs
          this screen nothing to carry. */}
      <AssistantFirstRun />
      <ChatScreen />
    </>
  );
}
