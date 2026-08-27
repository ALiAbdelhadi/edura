import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for guardian verification.
 *
 * The guardian link is verified before the outcome can be stated.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
