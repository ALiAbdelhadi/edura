import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for a course's public page.
 *
 * A public course page. The price and the enrolment CTA arrive client-side and are never prerendered.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
