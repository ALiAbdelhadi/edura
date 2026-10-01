import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { ok } from "@repo/server-core/http/envelope";
import { getSessionUser } from "@repo/server-core/erp-auth/session";
import { searchTeachersByDayCached } from "@repo/server-core/services/discovery/discovery-cache";
import { resolveStudentCatalogScope } from "@repo/server-core/services/discovery/student-scope";

export const GET = withRateLimit(
  withErrors(async (req) => {
    const url = new URL(req.url);
    const filters = {
      daysOfWeek: url.searchParams.get("daysOfWeek") ?? undefined,
      subject: url.searchParams.get("subject") ?? undefined,
      subjectId: url.searchParams.get("subjectId") ?? undefined,
      deliveryMode: url.searchParams.get("deliveryMode") ?? undefined,
      timeBucket: url.searchParams.get("timeBucket") ?? undefined,
      minRating: url.searchParams.get("minRating") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    };

    const browseAll = url.searchParams.get("scope") === "all";

    const user = await getSessionUser();
    const studentScope = await resolveStudentCatalogScope(
      user,
      browseAll,
      url.searchParams.get("studentId"),
    );

    const result = await searchTeachersByDayCached(filters, studentScope);
    return ok(result.teachers, {
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  }),
  60,
  60,
);
