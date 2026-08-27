import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for /onboarding.
 *
 * The wizard resolves the session and the catalog before it can draw its first step.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
