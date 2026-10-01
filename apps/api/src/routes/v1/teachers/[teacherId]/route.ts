import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { PUBLIC_CACHE, withPublicCache } from "@repo/server-core/http/public-cache";
import { getTeacherPublicProfile } from "@repo/server-core/services/reviews/reviews";

export const GET = withPublicCache(
  withErrors(async (_req, ctx) => {
    const profile = await getTeacherPublicProfile((await ctx.params).teacherId);
    return ok(profile);
  }),
  PUBLIC_CACHE.discovery,
);
