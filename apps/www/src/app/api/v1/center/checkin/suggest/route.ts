import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import { suggestSessions } from "@/lib/services/attendance/checkin";

export const dynamic = "force-dynamic";

/** Today's sessions: `suggested` (student holds coverage) + `today` (manual pick). */
export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const studentId = new URL(req.url).searchParams.get("studentId");
  if (!studentId) throw new BusinessRuleError("studentId is required");
  return ok(await suggestSessions(studentId, user));
});
