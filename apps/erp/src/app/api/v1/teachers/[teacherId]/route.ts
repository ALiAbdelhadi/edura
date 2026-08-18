import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { getTeacherPublicProfile } from "@/lib/services/reviews/reviews";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const profile = await getTeacherPublicProfile((await ctx.params).teacherId);
  return ok(profile);
});
