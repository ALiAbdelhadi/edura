import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for /dashboard.
 *
 * The portal router reads the session on the server and redirects to the caller's own portal. That read is the wait, and it used to show a blank frame.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
