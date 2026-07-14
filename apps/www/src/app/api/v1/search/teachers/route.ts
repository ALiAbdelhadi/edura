import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { ok } from "@/lib/http/envelope";
import { searchTeachers } from "@/lib/services/discovery/discovery";

export const dynamic = "force-dynamic";

export const GET = withRateLimit(withErrors(async (req) => {
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
}), 60, 60);
