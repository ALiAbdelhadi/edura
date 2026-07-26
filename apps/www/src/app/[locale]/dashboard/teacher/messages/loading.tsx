import { ChatSkeleton } from "@/components/ui/route-skeletons";

/**
 * Messaging is a two-pane layout, so the generic RouteSkeleton would read as a
 * table here. Renders an empty conversation shape — never any message content.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <ChatSkeleton />;
}
