import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import { suggestSessions } from "@/lib/services/attendance/checkin";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const studentId = new URL(req.url).searchParams.get("studentId");
    if (!studentId) throw new BusinessRuleError("studentId is required");
    return ok(await suggestSessions(studentId, user));
  },
  { allow: RECEPTION },
);
