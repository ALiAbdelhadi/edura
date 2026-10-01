import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listStudentPointsHistory } from "@repo/server-core/services/points/points";

export const GET = withErrors(async (req) => {
  const user = await requireRole("student");
  const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;
  const history = await listStudentPointsHistory(user.id, { limit });
  return ok(history);
});
