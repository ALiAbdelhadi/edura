import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { PUBLIC_CACHE, withPublicCache } from "@/lib/http/public-cache";
import { getTeacherPublicProfile } from "@/lib/services/reviews/reviews";

export const dynamic = "force-dynamic";

export const GET = withPublicCache(
  withErrors(async (_req, ctx) => {
    const profile = await getTeacherPublicProfile((await ctx.params).teacherId);
    return ok(profile);
  }),
  PUBLIC_CACHE.discovery,
);
