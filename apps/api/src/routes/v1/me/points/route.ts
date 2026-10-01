import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getStudentPoints } from "@repo/server-core/services/points/points";

export const GET = withErrors(async () => {
  const user = await requireRole("student");
  const points = await getStudentPoints(user.id);
  return ok(points);
});
