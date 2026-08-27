import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for a center's public page.
 *
 * A public center page: the shell paints immediately, the profile arrives from the API.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
