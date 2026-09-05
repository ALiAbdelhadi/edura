import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { authorizeCenterActor } from "@/lib/authz/center-actor";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrors(async (_req, ctx) => {
  // SECURITY_AUDIT.md M-01: `center_staff` is re-keyed to their own centre the
  // way GET /api/v1/sessions already does, so the `center_admin` branch below
  // fires for them. Before this they fell through every branch and read any
  // centre's session by id.
  const session0 = await requireSession();
  const user =
    session0.role === "center_staff"
      ? (
          await authorizeCenterActor(session0, {
            allow: ["receptionist", "manager", "center_accountant"],
          })
        ).acting
      : await toActingUser(session0);

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
    } else {
      // Terminal else (M-01): a role this chain does not name reads nothing.
      throw new ForbiddenError();
    }

    return session;
  });

  return ok(session);
});
