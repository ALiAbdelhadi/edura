import { withErrors } from "@/lib/errors/http";
import { toDateKey } from "@repo/server-core/lib/date-key";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { scopedDb } from "@/lib/db/scope";
import { ForbiddenError } from "@/lib/errors/classes";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireSession();

  const url = new URL(req.url);
  const studentIdParam = url.searchParams.get("studentId") ?? undefined;

  const attendance = await scopedDb(user, async (tx) => {
    let targetStudentId: string;
    if (user.role === "student") {
      targetStudentId = user.id;
    } else if (user.role === "parent") {
      if (!studentIdParam) throw new ForbiddenError("studentId required for parent");
      const link = await tx.parentStudentLink.findFirst({
        where: {
          parentId: user.id,
          studentId: studentIdParam,
          status: "approved",
        },
      });
      if (!link) throw new ForbiddenError("Not linked to this student");
      targetStudentId = studentIdParam;
    } else if (user.role === "center_admin") {
      if (!studentIdParam) throw new ForbiddenError("studentId required for admin");
      const roster = await tx.centerStudentRoster.findFirst({
        where: {
          centerId: user.centerId,
          studentId: studentIdParam,
          leftAt: null,
        },
      });
      if (!roster) throw new ForbiddenError("Student is not in this center's roster");
      targetStudentId = studentIdParam;
    } else {
      throw new ForbiddenError("Role not allowed");
    }

    const records = await tx.attendanceRecord.findMany({
      where: { studentId: targetStudentId },
      orderBy: { createdAt: "desc" },
      include: { session: true },
    });

    const courseIds = [...new Set(records.map((r) => r.courseId))];
    const courses = courseIds.length
      ? await tx.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, title: true },
        })
      : [];

    return { records, courseNames: new Map(courses.map((c) => [c.id, c.title])) };
  });

  const { records: result, courseNames } = attendance;

  let present = 0;
  let absent = 0;
  let late = 0;

  const dayRecords = result.map((r) => {
    const status = r.status === "present" ? "present" : r.status === "excused" ? "late" : "absent";
    if (status === "present") present++;
    else if (status === "absent") absent++;
    else late++;

    return {
      date: r.session?.date ? toDateKey(r.session.date) : "",
      status,
      courseId: r.courseId,
      courseName: courseNames.get(r.courseId) ?? "",
    };
  });

  const total = present + absent + late;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;

  return ok({
    present,
    absent,
    late,
    total,
    rate,
    records: dayRecords,
  });
});
