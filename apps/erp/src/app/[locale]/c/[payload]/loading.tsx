import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for a scanned student card.
 *
 * The scanned-card route resolves a signed payload server-side before it knows what to render.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
