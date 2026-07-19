import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrors(async (_req, ctx) => {
  const user = await toActingUser(await requireSession());

  const { id } = await ctx.params;

  const session = await scopedDb(user, async (tx) => {
    const session = await tx.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundError("Session not found");

    if (user.role === "center_admin") {
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true },
      });
      if (!course || course.centerId !== user.centerId) {
        throw new ForbiddenError("Session not in your center");
      }
    } else if (user.role === "teacher") {
      if (session.teacherId !== user.id) {
        throw new ForbiddenError("Not your session");
      }
    } else if (user.role === "student") {
      const enrollment = await tx.enrollment.findFirst({
        where: { courseId: session.courseId, studentId: user.id, status: "active" },
      });
      if (!enrollment) throw new ForbiddenError("Not enrolled in this course");
    } else if (user.role === "parent") {
      const links = await tx.parentStudentLink.findMany({
        where: { parentId: user.id, status: "approved" },
        select: { studentId: true },
      });
      const studentIds = links.map((l) => l.studentId);
      const enrollment = await tx.enrollment.findFirst({
        where: {
          courseId: session.courseId,
          studentId: { in: studentIds },
          status: "active",
        },
      });
      if (!enrollment) throw new ForbiddenError("No linked child enrolled in this course");
    }

    return session;
  });

  return ok(session);
});
