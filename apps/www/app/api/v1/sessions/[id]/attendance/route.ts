import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { getSessionUser } from "@/lib/auth/session";
import { requireCenterScope } from "@/lib/authz/requireCenterScope";
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
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Not authenticated");

  const sessionId = (await ctx.params).id;

  await scopedDb(user, async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError("Session not found");

    if (user.role === "teacher") {
      // Teacher must be the assigned teacher of the session
      if (session.teacherId !== user.id) throw new ForbiddenError();
    } else if (user.role === "center_admin") {
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true },
      });
      if (!course) throw new NotFoundError("Course not found");
      requireCenterScope(user, course.centerId);
    }
    // student/parent: scoped inside service
  });

  const result = await getSessionAttendance(sessionId, user.id, user.role, user.centerId);
  return ok(result);
});

const attendanceEntrySchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["present", "absent", "excused"]),
});

// Accept either `[{...}]` or `{ records: [{...}] }` to line up with the
// Postman collection payload.
const bulkMarkSchema = z.union([
  z.array(attendanceEntrySchema).min(1),
  z.object({ records: z.array(attendanceEntrySchema).min(1) }),
]);

export const PUT = withErrors(async (req, ctx) => {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Not authenticated");
  if (user.role !== "teacher" && user.role !== "center_admin") {
    throw new ForbiddenError("Only teachers and admins can mark attendance");
  }

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

    // Resolve course → center to run the center-scope check (admin) or upsert centerId (teacher).
    const course = await tx.course.findUnique({
      where: { id: session.courseId },
      select: { centerId: true },
    });
    if (!course) throw new NotFoundError("Course not found");
    if (user.role === "center_admin") requireCenterScope(user, course.centerId);

    return course.centerId;
  });

  const result = await bulkMarkAttendance(sessionId, entries, user.id, centerId);
  return ok(result);
});
