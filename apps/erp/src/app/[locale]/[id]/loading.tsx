import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for the short-id landing page.
 *
 * Resolving a short affiliation id before anything can be shown.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
