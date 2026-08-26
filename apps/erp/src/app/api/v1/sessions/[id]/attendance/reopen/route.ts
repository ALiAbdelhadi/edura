import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { reopenAttendanceForSettlement } from "@repo/server-core/services/attendance/attendance";

export const dynamic = "force-dynamic";

/**
 * T-9: reopen the register for a never-settled lesson past the 7-day window,
 * so it can finally be closed and its money credited.
 *
 * `delegatedWithCenter`, not `delegated`: BOTH actors legitimately hold this
 * workflow. The teacher (or their assistant — the register is a delegated
 * surface) owns their own lessons; the CENTER owns lessons of EXTERNAL
 * teachers, who have no account at all, and whose past-lesson catch-up is a
 * designed flow that `buildGapReport` actively prompts
 * (docs/decisions/external-teachers.md §4-5). Restricting this to the teacher
 * would have deleted that capability rather than guarded it.
 *
 * Staff tier: MANAGER — the same tier that already accepts collaboration
 * requests and runs the operational side of a center. A receptionist does not
 * reopen a closed register.
 */
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
