import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { ok } from "@repo/server-core/http/envelope";
import { listCounterSessions } from "@repo/server-core/services/attendance/counter";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const teacherId = new URL(req.url).searchParams.get("teacherId");
    if (!teacherId) throw new BusinessRuleError("teacherId is required");
    return ok(await listCounterSessions(teacherId, user));
  },
  { allow: RECEPTION },
);
