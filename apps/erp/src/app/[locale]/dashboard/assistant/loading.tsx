import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for every page under /dashboard/assistant that does not
 * define its own. Renders inside the role layout, so the sidebar and header
 * stay put and only the content area swaps while the segment's RSC payload is
 * in flight — previously this was a blank frame.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
