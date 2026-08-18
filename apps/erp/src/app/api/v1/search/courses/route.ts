import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { ok } from "@/lib/http/envelope";
import { getSessionUser } from "@/lib/auth/session";
import { platformDb } from "@/lib/db/scope";
import {
  searchCourses,
  type StudentCatalogScope,
} from "@/lib/services/discovery/discovery";
import { assertApprovedChild } from "@/lib/services/wallet/parent-wallet";

export const dynamic = "force-dynamic";

export const GET = withRateLimit(
  withErrors(async (req) => {
    const url = new URL(req.url);
    const filters = {
      subject: url.searchParams.get("subject") ?? undefined,
      subjectId: url.searchParams.get("subjectId") ?? undefined,
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

    // scope=all — explicit browse-all opt-in: skip the student's grade/track
    // scope entirely. The default stays track-filtered.
    const browseAll = url.searchParams.get("scope") === "all";

    let studentScope: StudentCatalogScope | null = null;
    const user = await getSessionUser();

    // WHOSE grade/track narrows the default list. A student's own; for a PARENT
    // shopping for a child, that child's — but only an APPROVED one. An
    // unapproved or absent studentId resolves no scope at all, which lands the
    // caller on the same unnarrowed list any anonymous browser already sees;
    // it never widens what a course row exposes.
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
          select: {
            onboardingCompleted: true,
            gradeLevelId: true,
            trackId: true,
          },
        }),
      );
      if (profile?.onboardingCompleted && profile.gradeLevelId) {
        studentScope = {
          gradeLevelId: profile.gradeLevelId,
          trackId: profile.trackId,
        };
      }
    }

    const result = await searchCourses(filters, studentScope);
    return ok(result.courses, {
      meta: { page: result.page, limit: result.limit },
    });
  }),
  60,
  60,
);
