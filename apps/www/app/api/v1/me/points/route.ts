import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getStudentPoints } from "@/lib/services/points/points";

export const dynamic = "force-dynamic";

// Student self-service: current points balance (PRD §4.6).
export const GET = withErrors(async () => {
  const user = await requireRole("student");
  const points = await getStudentPoints(user.id);
  return ok(points);
});
