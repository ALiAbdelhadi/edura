import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { counterRoster } from "@repo/server-core/services/attendance/counter";

export const dynamic = "force-dynamic";

/** One lesson's roster — the union behind both tabs, plus the counts. */
export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId) throw new BusinessRuleError("sessionId is required");
    return ok(await counterRoster(sessionId, user));
  },
  { allow: RECEPTION },
);
