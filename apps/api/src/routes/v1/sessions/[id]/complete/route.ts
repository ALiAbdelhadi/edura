import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { completeSession } from "@repo/server-core/services/finance/distribution";
import { auditStaffSessionCompleted } from "@repo/server-core/services/session-actions/complete-audit";

export const POST = delegatedWithCenter(
  async (_req, ctx, actor) => {
    const { id } = await ctx.params;
    const result = await completeSession(id, actor.acting);

    const staffRole = (actor as { staffRole?: string | null }).staffRole ?? null;
    if (staffRole) {
      await auditStaffSessionCompleted({
        actorId: actor.actorId,
        sessionId: id,
        centerId: actor.acting.centerId,
        staffRole,
        distributed: result.distribution.distributed,
        presentCount: result.distribution.presentCount ?? 0,
      });
    }
    return ok(result);
  },
  { staffAllow: ["receptionist", "manager"] },
);
