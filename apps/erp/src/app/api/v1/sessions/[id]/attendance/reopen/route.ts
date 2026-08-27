import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { reopenAttendanceForSettlement } from "@repo/server-core/services/attendance/attendance";

export const dynamic = "force-dynamic";

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
