import type { NextResponse } from "next/server";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { platformDb, type TenantTx } from "@/lib/db/scope";
import { ForbiddenError } from "@/lib/errors/classes";
import type { Role, CenterStaffRole } from "@repo/database";
import { requireSession, type SessionUser } from "@/lib/auth/session";
import { runCenterActor, type CenterActorHandler } from "@/lib/authz/center-actor";

/**
 * Step 8 — assistant delegation, concentrated in THIS module only.
 *
 * Model (approved decisions #2/#9): an assistant serves exactly one teacher
 * (partial unique on assistant_id WHERE removed_at IS NULL); a teacher may
 * have many assistants; every assistant gets full delegation — everything the
 * teacher can do EXCEPT wallet/payout/financial settings and managing
 * assistants.
 *
 * The exclusions are enforced by DEFAULT-CLOSED design: `requireRole("teacher")`
 * keeps rejecting assistants everywhere; a route opens to delegation only by
 * switching to `delegated()` (or `requireTeacherActor()`), and the money +
 * assistant-management routes are simply never switched. A forgotten route
 * fails closed, never open.
 */

export type TeacherActor = {
  /**
   * Teacher-shaped session user for data scoping: id is ALWAYS the teacher's
   * id, so scopedDb and every `where teacherId:` clause inherit the TEACHER'S
   * scope (never a center's). For a real teacher this is the caller itself.
   */
  acting: SessionUser;
  /** The real caller's session (assistant or teacher) — for record fidelity
   *  (e.g. doorBy stores the assistant's own id). */
  caller: SessionUser;
  /** The real caller (assistant or teacher) — audit actor. */
  actorId: string;
  /** Set only for assistants: the teacher they act for. */
  onBehalfOf: string | null;
};

/**
 * THE single resolution of assistant -> teacher (live link, revocation-aware).
 * Step 6 door check-in + offline sync route through this too.
 */
export async function resolveActingTeacher(
  tx: TenantTx,
  user: SessionUser,
): Promise<string> {
  if (user.role === "teacher") return user.id;
  if (user.role !== "assistant") throw new ForbiddenError();
  const link = await tx.teacherAssistant.findFirst({
    where: { assistantId: user.id, removedAt: null },
    select: { teacherId: true },
  });
  if (!link) throw new ForbiddenError("Assistant is not linked to a teacher");
  return link.teacherId;
}

/** Resolve the current caller into a TeacherActor (403 for anyone else). */
export async function requireTeacherActor(
  alsoRoles: Role[] = [],
): Promise<TeacherActor> {
  const user = await requireRole("teacher", "assistant", ...alsoRoles);
  if (user.role !== "assistant") {
    return { acting: user, caller: user, actorId: user.id, onBehalfOf: null };
  }
  const teacherId = await platformDb((tx) => resolveActingTeacher(tx, user));
  const teacher = await platformDb((tx) =>
    tx.user.findUnique({
      where: { id: teacherId },
      select: { name: true, email: true, locale: true },
    }),
  );
  return {
    acting: {
      id: teacherId,
      role: "teacher",
      locale: user.locale,
      name: teacher?.name ?? null,
      email: teacher?.email ?? null,
    },
    caller: user,
    actorId: user.id,
    onBehalfOf: teacherId,
  };
}

/**
 * Passthrough for role-branched READ routes (sessions/grades/materials/
 * enrollments/courses GET): an assistant becomes their teacher-shaped acting
 * user so the existing teacher branch applies; everyone else is unchanged.
 */
export async function toActingUser(user: SessionUser): Promise<SessionUser> {
  if (user.role !== "assistant") return user;
  const teacherId = await platformDb((tx) => resolveActingTeacher(tx, user));
  return { ...user, id: teacherId, role: "teacher" };
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type ActorHandler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
  actor: TeacherActor,
) => Promise<NextResponse>;

/**
 * Route gate for delegated teacher endpoints. Replaces requireRole("teacher").
 * On a successful MUTATING call by an assistant it writes the on-behalf-of
 * audit row — one choke point covers every delegated mutation (decision #3),
 * including services that never audited before.
 */
export function delegated(
  handler: ActorHandler,
  opts?: { alsoRoles?: Role[] },
) {
  return withErrors(async (req, ctx) => {
    const actor = await requireTeacherActor(opts?.alsoRoles);
    const res = await handler(req, ctx, actor);
    if (actor.onBehalfOf && MUTATING.has(req.method) && res.ok) {
      const pathname = new URL(req.url).pathname;
      await platformDb(
        (tx) =>
          tx.auditLog.create({
            data: {
              actorId: actor.actorId,
              action: `assistant.${req.method.toLowerCase()}`,
              targetType: "teacher",
              targetId: actor.onBehalfOf,
              onBehalfOf: actor.onBehalfOf,
              afterState: { path: pathname, method: req.method },
            },
          }),
        { actorId: actor.actorId },
      ).catch(() => {
        // Attribution must never break the action itself; the action already
        // succeeded. (Monitoring picks up audit failures via logs.)
        console.error(`[delegation] audit write failed for ${pathname}`);
      });
    }
    return res;
  });
}

/**
 * Gate for routes SHARED between the teacher side (teacher/assistant) and the
 * center side (center_admin/center_staff): collaboration requests, session
 * lifecycle, etc.
 *
 * - teacher / assistant caller -> the unchanged Step 8 `delegated()` path
 *   (assistant mutations audited on-behalf-of the teacher). This path is
 *   byte-for-byte identical to before — no Step 8 regression.
 * - center_admin caller -> passes through with full power (acting = itself),
 *   no on-behalf-of audit (unchanged prior behavior).
 * - center_staff caller -> routed through the center actor, gated by
 *   `staffAllow` (e.g. MANAGER for collaboration accept/reject); mutations
 *   audited on-behalf-of the center. If `staffAllow` is omitted, NO staff role
 *   may pass (default-closed) and only the owner reaches the handler.
 */
export function delegatedWithCenter(
  handler: ActorHandler,
  opts?: { staffAllow?: readonly CenterStaffRole[] },
) {
  const teacherPath = delegated(handler); // teacher/assistant only
  return withErrors(async (req, ctx) => {
    const user = await requireSession();
    if (user.role === "center_admin" || user.role === "center_staff") {
      // CenterActor is a structural superset of TeacherActor (adds staffRole);
      // handlers only read acting/caller/actorId/onBehalfOf, so this is safe.
      return runCenterActor(
        req,
        ctx,
        handler as unknown as CenterActorHandler,
        { allow: opts?.staffAllow ?? [] },
      );
    }
    return teacherPath(req, ctx);
  });
}
