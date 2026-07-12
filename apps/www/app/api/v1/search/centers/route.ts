import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rateLimit/middleware";
import { ok } from "@/lib/http/envelope";
import { searchCenters } from "@/lib/services/discovery/discovery";

export const dynamic = "force-dynamic";

export const GET = withRateLimit(withErrors(async (req) => {
  const url = new URL(req.url);
  const filters = {
    subject: url.searchParams.get("subject") ?? undefined,
    distanceKm: url.searchParams.get("distanceKm") ?? undefined,
    nearLat: url.searchParams.get("nearLat") ?? undefined,
    nearLng: url.searchParams.get("nearLng") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };

  const result = await searchCenters(filters);
  return ok(result.centers, { meta: { page: result.page, limit: result.limit } });
}), 60, 60);
