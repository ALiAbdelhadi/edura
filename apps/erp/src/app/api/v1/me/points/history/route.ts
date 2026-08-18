import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listStudentPointsHistory } from "@/lib/services/points/points";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("student");
  const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;
  const history = await listStudentPointsHistory(user.id, { limit });
  return ok(history);
});
