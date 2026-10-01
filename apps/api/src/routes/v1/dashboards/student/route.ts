import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getStudentDashboard } from "@repo/server-core/services/dashboards/student";

export const GET = withErrors(async () => {
  const user = await requireRole("student");
  return ok(await getStudentDashboard(user));
});
