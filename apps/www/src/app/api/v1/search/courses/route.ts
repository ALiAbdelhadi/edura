import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { ok } from "@/lib/http/envelope";
import { getSessionUser } from "@/lib/auth/session";
import { platformDb } from "@/lib/db/scope";
import {
  searchCourses,
  type StudentCatalogScope,
} from "@/lib/services/discovery/discovery";

export const dynamic = "force-dynamic";

export const GET = withRateLimit(
  withErrors(async (req) => {
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

    let studentScope: StudentCatalogScope | null = null;
    const user = await getSessionUser();
    if (user?.role === "student") {
      const profile = await platformDb((tx) =>
        tx.studentProfile.findUnique({
          where: { userId: user.id },
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
