import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getTeacherDashboard } from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  const result = await getTeacherDashboard(user);
  return ok(result);
});
