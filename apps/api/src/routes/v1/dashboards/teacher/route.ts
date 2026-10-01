import { withErrors } from "@repo/server-core/errors/http";
import { delegated } from "@repo/server-core/authz/teacher-actor";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getTeacherDashboard } from "@repo/server-core/services/reports/reports";

export const GET = delegated(async (req, _ctx, { acting: user }) => {
  const sp = new URL(req.url).searchParams;
  const result = await getTeacherDashboard(user, {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  return ok(result);
});
