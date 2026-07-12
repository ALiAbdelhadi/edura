import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rateLimit/middleware";
import { ok } from "@/lib/http/envelope";
import { searchCourses } from "@/lib/services/discovery/discovery";

export const dynamic = "force-dynamic";

export const GET = withRateLimit(withErrors(async (req) => {
  const url = new URL(req.url);
  const filters = {
    subject: url.searchParams.get("subject") ?? undefined,
    priceMin: url.searchParams.get("priceMin") ?? undefined,
    priceMax: url.searchParams.get("priceMax") ?? undefined,
    daysOfWeek: url.searchParams.get("daysOfWeek") ?? undefined,
    timeBucket: url.searchParams.get("timeBucket") ?? undefined,
    distanceKm: url.searchParams.get("distanceKm") ?? undefined,
    nearLat: url.searchParams.get("nearLat") ?? undefined,
    nearLng: url.searchParams.get("nearLng") ?? undefined,
    minRating: url.searchParams.get("minRating") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };

  const result = await searchCourses(filters);
  return ok(result.courses, { meta: { page: result.page, limit: result.limit } });
}), 60, 60);
