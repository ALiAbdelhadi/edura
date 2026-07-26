import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for every page under /dashboard/finance. Renders inside
 * the segment layout, so the sidebar and header stay put and only the content
 * area swaps while the segment's RSC payload is in flight.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
