import { withErrors } from "@/lib/errors/http";
import { delegated } from "@/lib/authz/teacher-actor";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getTeacherDashboard } from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

export const GET = delegated(async (req, _ctx, { acting: user }) => {
  // `from`/`to` bound `avgAttendanceRate` to a period (T-7); omitted still
  // means lifetime, and the response's `period` says which one you got.
  const sp = new URL(req.url).searchParams;
  const result = await getTeacherDashboard(user, {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  return ok(result);
});
