import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { platformDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { completeSession } from "@/lib/services/finance/distribution";

export const dynamic = "force-dynamic";

/**
 * End the lesson — the money trigger. Phase 3 opens it to the counter
 * (receptionist / manager): "إنهاء الحصة" is the front desk's button in the
 * classic center workflow, and Phase 0 already made it lock the register the
 * moment it lands. The kernel still re-checks the actor against the session
 * itself (assertMaySettle), so this route holds no policy of its own.
 */
export const POST = delegatedWithCenter(
  async (_req, ctx, actor) => {
    const { id } = await ctx.params;
    const result = await completeSession(id, actor.acting);

    // Staff act ON BEHALF OF the center and money actions are audited as such.
    // Written AFTER the settlement committed (same posture as notifications —
    // a failed audit write must never roll back settled money).
    const staffRole = (actor as { staffRole?: string | null }).staffRole ?? null;
    if (staffRole) {
      await platformDb(
        (tx) =>
          tx.auditLog.create({
            data: {
              actorId: actor.actorId,
              action: "session.completed",
              targetType: "session",
              targetId: id,
              afterState: {
                onBehalfOfCenter: actor.acting.centerId,
                staffRole,
                distributed: result.distribution.distributed,
                presentCount: result.distribution.presentCount ?? 0,
              },
            },
          }),
        { actorId: actor.actorId },
      );
    }
    return ok(result);
  },
  { staffAllow: ["receptionist", "manager"] },
);
