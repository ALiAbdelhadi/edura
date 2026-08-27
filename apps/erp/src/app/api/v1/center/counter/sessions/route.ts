import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { listCounterSessions } from "@repo/server-core/services/attendance/counter";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const teacherId = new URL(req.url).searchParams.get("teacherId");
    if (!teacherId) throw new BusinessRuleError("teacherId is required");
    return ok(await listCounterSessions(teacherId, user));
  },
  { allow: RECEPTION },
);
