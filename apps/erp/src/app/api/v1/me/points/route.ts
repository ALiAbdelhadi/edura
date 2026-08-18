import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getStudentPoints } from "@/lib/services/points/points";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("student");
  const points = await getStudentPoints(user.id);
  return ok(points);
});
