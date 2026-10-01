import { withErrors } from "../errors/http";
import { requireRole } from "./require-role";
import { platformDb, type TenantTx } from "../db/scope";
import { ForbiddenError } from "../errors/classes";
import { resolveActingTeacher } from "./acting-teacher";
import type { Role, CenterStaffRole } from "@repo/database";
import { requireSession, type SessionUser } from "../erp-auth/session";
import { runCenterActor, type CenterActorHandler } from "./center-actor";

export type TeacherActor = {
  acting: SessionUser;
  caller: SessionUser;
  actorId: string;
  onBehalfOf: string | null;
};

export { resolveActingTeacher };
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
) => Promise<Response>;

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
        console.error(`[delegation] audit write failed for ${pathname}`);
      });
    }
    return res;
  });
}

export function delegatedWithCenter(
  handler: ActorHandler,
  opts?: { staffAllow?: readonly CenterStaffRole[] },
) {
  const teacherPath = delegated(handler); // teacher/assistant only
  return withErrors(async (req, ctx) => {
    const user = await requireSession();
    if (user.role === "center_admin" || user.role === "center_staff") {
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
