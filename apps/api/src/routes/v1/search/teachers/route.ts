import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { ok } from "@repo/server-core/http/envelope";
import { PUBLIC_CACHE, withPublicCache } from "@repo/server-core/http/public-cache";
import { searchTeachers } from "@repo/server-core/services/discovery/discovery";

export const GET = withRateLimit(withPublicCache(withErrors(async (req) => {
  const url = new URL(req.url);
  const filters = {
    subject: url.searchParams.get("subject") ?? undefined,
    minRating: url.searchParams.get("minRating") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };

  const result = await searchTeachers(filters);
  return ok(result.teachers, { meta: { page: result.page, limit: result.limit } });
}), PUBLIC_CACHE.discovery), 60, 60);
