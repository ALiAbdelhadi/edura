import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { ok } from "@/lib/http/envelope";
import { PUBLIC_CACHE, withPublicCache } from "@/lib/http/public-cache";
import { searchCenters } from "@/lib/services/discovery/discovery";

export const dynamic = "force-dynamic";

export const GET = withRateLimit(withPublicCache(withErrors(async (req) => {
  const url = new URL(req.url);
  const filters = {
    subject: url.searchParams.get("subject") ?? undefined,
    distanceKm: url.searchParams.get("distanceKm") ?? undefined,
    nearLat: url.searchParams.get("nearLat") ?? undefined,
    nearLng: url.searchParams.get("nearLng") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    includeEmpty: url.searchParams.get("includeEmpty") === "1",
  };

  const result = await searchCenters(filters);
  return ok(result.centers, { meta: { page: result.page, limit: result.limit } });
}), PUBLIC_CACHE.discovery), 60, 60);
