import { delegated } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getTeacherCoverage } from "@repo/server-core/services/subscriptions/teacher-coverage";

export const GET = delegated(async (req, _ctx, { acting }) => {
  const sp = new URL(req.url).searchParams;
  const result = await getTeacherCoverage(acting, {
    courseId: sp.get("courseId") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  return ok(result);
});
