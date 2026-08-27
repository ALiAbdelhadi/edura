import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { platformDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { completeSession } from "@/lib/services/finance/distribution";

export const dynamic = "force-dynamic";

export const POST = delegatedWithCenter(
  async (_req, ctx, actor) => {
    const { id } = await ctx.params;
    const result = await completeSession(id, actor.acting);

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
