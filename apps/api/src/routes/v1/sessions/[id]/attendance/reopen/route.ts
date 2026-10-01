import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { reopenAttendanceForSettlement } from "@repo/server-core/services/attendance/attendance";

export const POST = delegatedWithCenter(
  async (_req, ctx, actor) => {
    const { id } = await ctx.params;
    const isCenter =
      actor.acting.role === "center_admin" && !!actor.acting.centerId;
    return ok(
      await reopenAttendanceForSettlement(
        id,
        isCenter
          ? {
              kind: "center",
              centerId: actor.acting.centerId as string,
              actorId: actor.actorId,
              onBehalfOf: actor.onBehalfOf,
            }
          : {
              kind: "teacher",
              actingTeacherId: actor.acting.id,
              actorId: actor.actorId,
              onBehalfOf: actor.onBehalfOf,
            },
      ),
    );
  },
  { staffAllow: MANAGER },
);
