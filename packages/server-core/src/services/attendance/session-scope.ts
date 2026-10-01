import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { requireCenterScope } from "../../authz/center-scope";
import { ForbiddenError, NotFoundError } from "../../errors/classes";

export function assertSessionAttendanceReadable(user: SessionUser, sessionId: string) {
  return scopedDb(user, async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (user.role === "teacher") {
      if (session.teacherId !== user.id) throw new ForbiddenError();
    } else if (user.role === "center_admin") {
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true },
      });
      if (!course) throw new NotFoundError("Course not found");
      requireCenterScope(user, course.centerId);
    } else if (user.role !== "student" && user.role !== "parent") {
      // Students and parents are narrowed to their own record inside
      // getSessionAttendance; anyone else has no business here.
      throw new ForbiddenError();
    }
  });
}

export function resolveSessionCenterForMarking(user: SessionUser, sessionId: string) {
  return scopedDb(user, async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (user.role === "teacher") {
      if (session.teacherId !== user.id) {
        throw new ForbiddenError("Not the assigned teacher for this session");
      }
    }

    const course = await tx.course.findUnique({
      where: { id: session.courseId },
      select: { centerId: true },
    });
    if (!course) throw new NotFoundError("Course not found");
    if (user.role === "center_admin") requireCenterScope(user, course.centerId);

    return course.centerId;
  });
}
