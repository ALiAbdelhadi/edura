import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/**
 * The assistant's HOME is the chat — messaging is the job this portal exists
 * for, and the nav's "Messages" entry points at `/dashboard/assistant` itself.
 * This route rendered a SECOND copy of the same screen, so the same inbox
 * existed at two addresses with two scroll positions and two unread states.
 *
 * It is kept as a redirect rather than deleted because it is a live deep-link
 * target: the notifications screen builds `${portal}/messages` for every
 * message notification, and those links are already out in people's inboxes.
 */
export default async function AssistantMessagesPage() {
  redirect({ href: "/dashboard/assistant", locale: await getLocale() });
}
