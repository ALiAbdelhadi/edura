import { RouteSkeleton } from "@/components/ui/route-skeletons";

/**
 * Streaming fallback for a receipt.
 *
 * A receipt is read from the ledger under the caller's own session.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
