import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { delegatedWithCenter, toActingUser } from "@/lib/authz/teacher-actor";
import { authorizeCenterActor } from "@/lib/authz/center-actor";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import {
  getSessionAttendance,
  bulkMarkAttendance,
} from "@/lib/services/attendance/attendance";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrors(async (_req, ctx) => {
  // SECURITY_AUDIT.md M-01 — see sessions/[id]/route.ts. Staff are re-keyed to
  // their centre; every role not named below is refused rather than falling
  // through to getSessionAttendance's full records + coverage.
  const session0 = await requireSession();
  const user =
    session0.role === "center_staff"
      ? (
          await authorizeCenterActor(session0, {
            allow: ["receptionist", "manager", "center_accountant"],
          })
        ).acting
      : await toActingUser(session0);

  const sessionId = (await ctx.params).id;

  await scopedDb(user, async (tx) => {
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

  const result = await getSessionAttendance(
    sessionId,
    user.id,
    user.role,
    user.centerId,
  );
  return ok(result);
});

const attendanceEntrySchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["present", "absent", "excused"]),
});

const bulkMarkSchema = z.union([
  z.array(attendanceEntrySchema).min(1),
  z.object({ records: z.array(attendanceEntrySchema).min(1) }),
]);

export const PUT = delegatedWithCenter(async (req, ctx, { acting: user }) => {

  const sessionId = (await ctx.params).id;
  const parsed = await parseJson(req, bulkMarkSchema);
  const entries = Array.isArray(parsed) ? parsed : parsed.records;

  const centerId = await scopedDb(user, async (tx) => {
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

  const result = await bulkMarkAttendance(
    sessionId,
    entries,
    user.id,
    centerId,
  );
  return ok(result);
});
