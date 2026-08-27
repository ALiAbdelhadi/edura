import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for /pricing.
 *
 * This page reads the live commission_settings row (see the note on the route's force-dynamic), so it waits on the database on every request.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
