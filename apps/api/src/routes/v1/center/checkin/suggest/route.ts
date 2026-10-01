import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { suggestSessions } from "@repo/server-core/services/attendance/checkin";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const studentId = new URL(req.url).searchParams.get("studentId");
    if (!studentId) throw new BusinessRuleError("studentId is required");
    return ok(await suggestSessions(studentId, user));
  },
  { allow: RECEPTION },
);
