import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { ok } from "@repo/server-core/http/envelope";
import { counterRoster } from "@repo/server-core/services/attendance/counter";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId) throw new BusinessRuleError("sessionId is required");
    return ok(await counterRoster(sessionId, user));
  },
  { allow: RECEPTION },
);
