import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { ok } from "@/lib/http/envelope";
import { getSessionUser } from "@/lib/auth/session";
import { platformDb } from "@/lib/db/scope";
import { type StudentCatalogScope } from "@/lib/services/discovery/discovery";
import { searchTeachersByDayCached } from "@/lib/services/discovery/discovery-cache";
import { assertApprovedChild } from "@/lib/services/wallet/parent-wallet";

export const dynamic = "force-dynamic";

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

    let studentScope: StudentCatalogScope | null = null;
    const user = await getSessionUser();

    let scopeUserId: string | null = null;
    if (!browseAll && user?.role === "student") {
      scopeUserId = user.id;
    } else if (!browseAll && user?.role === "parent") {
      const childId = url.searchParams.get("studentId");
      if (childId) {
        await platformDb((tx) => assertApprovedChild(tx, user.id, childId));
        scopeUserId = childId;
      }
    }

    if (scopeUserId) {
      const profile = await platformDb((tx) =>
        tx.studentProfile.findUnique({
          where: { userId: scopeUserId },
          select: { onboardingCompleted: true, gradeLevelId: true, trackId: true },
        }),
      );
      if (profile?.onboardingCompleted && profile.gradeLevelId) {
        studentScope = { gradeLevelId: profile.gradeLevelId, trackId: profile.trackId };
      }
    }

    const result = await searchTeachersByDayCached(filters, studentScope);
    return ok(result.teachers, {
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  }),
  60,
  60,
);
