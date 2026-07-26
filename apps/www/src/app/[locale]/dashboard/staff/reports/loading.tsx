import { ChartsSkeleton } from "@/components/ui/route-skeletons";

/**
 * The analytics screens are a stat row above chart cards, not a table.
 *
 * Presentation only: no data fetch, no session read, no API call.
 */
export default function Loading() {
  return <ChartsSkeleton />;
}
