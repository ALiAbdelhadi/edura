import { z } from "zod";
import { toDateKey } from "@repo/server-core/lib/date-key";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { getSessionUser } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema, isNotPastDate } from "@/lib/validation/common";
import { createCourse } from "@repo/server-core/services/center/courses";
import { trackFirstGroup } from "@/lib/observability/funnel";

export const dynamic = "force-dynamic";

function withSchedulePattern<
  T extends {
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    startDate: Date;
    endDate: Date | null;
  },
>(course: T) {
  return {
    ...course,
    schedulePattern: {
      daysOfWeek: course.daysOfWeek,
      startTime: course.startTime,
      endTime: course.endTime,
      startDate: course.startDate,
      endDate: course.endDate,
    },
  };
}

export const GET = withErrors(async (req) => {
  const url = new URL(req.url);
  const user0 = await getSessionUser();
  const user = user0 ? await toActingUser(user0) : null;

  const centerIdParam = url.searchParams.get("centerId");
  const teacherIdParam = url.searchParams.get("teacherId");
  const subject = url.searchParams.get("subject");
  const status = url.searchParams.get("status");

  const result = await scopedDb(user, async (tx) => {
    // SCOPE — FAIL-CLOSED. Every caller sees ONLY the courses within their own
    // scope; a caller whose scope can't be resolved gets NOTHING. This mirrors
    // the per-role scoping the enrollments endpoint already does, and closes the
    // old fall-open where a student / parent / unauthenticated request (which
    // matched no role branch) returned the ENTIRE course catalog.
    const where: Prisma.CourseWhereInput = {};

    if (user?.role === "center_admin") {
      where.centerId = user.centerId;
      // An admin MAY narrow to one of their center's teachers.
      if (teacherIdParam) where.teacherId = teacherIdParam;
    } else if (user?.role === "teacher") {
      // A teacher sees ONLY the courses they teach — never another teacher's,
      // and a teacherId param can never broaden this.
      where.teacherId = user.id;
    } else if (user?.role === "student") {
      // A student sees only the courses they are enrolled in (any status, so
      // completed-course grades still resolve their course name).
      const enr = await tx.enrollment.findMany({
        where: { studentId: user.id },
        select: { courseId: true },
      });
      where.id = { in: enr.map((e) => e.courseId) };
    } else if (user?.role === "parent") {
      // A parent sees only their approved children's enrolled courses.
      const links = await tx.parentStudentLink.findMany({
        where: { parentId: user.id, status: "approved" },
        select: { studentId: true },
      });
      const childIds = links.map((l) => l.studentId);
      const enr = childIds.length
        ? await tx.enrollment.findMany({
            where: { studentId: { in: childIds } },
            select: { courseId: true },
          })
        : [];
      where.id = { in: enr.map((e) => e.courseId) };
    } else if (centerIdParam) {
      // Public/anonymous discovery is allowed ONLY for an explicit center.
      where.centerId = centerIdParam;
    } else {
      // No scope could be resolved — fail closed, never dump the catalog.
      return [];
    }

    if (subject) where.subject = subject;
    if (status) where.status = status as Prisma.CourseWhereInput["status"];

    const courses = await tx.course.findMany({ where });

    const courseIds = courses.map((c) => c.id);
    const teacherIds = [...new Set(courses.map((c) => c.teacherId).filter(Boolean))];
    const roomIds = [
      ...new Set(courses.map((c) => c.defaultRoomId).filter(Boolean) as string[]),
    ];

    const [counts, teachers, rooms] = await Promise.all([
      tx.enrollment.groupBy({
        by: ["courseId"],
        where: { courseId: { in: courseIds }, status: "active" },
        _count: { _all: true },
      }),
      tx.user.findMany({
        where: { id: { in: teacherIds } },
        select: { id: true, name: true, email: true },
      }),
      tx.room.findMany({
        where: { id: { in: roomIds } },
        select: { id: true, name: true },
      }),
    ]);
    const countMap = new Map(counts.map((c) => [c.courseId, c._count._all]));
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));

    return courses.map((c) => {
      const enrolled = countMap.get(c.id) ?? 0;
      const t = teacherMap.get(c.teacherId);
      const r = c.defaultRoomId ? roomMap.get(c.defaultRoomId) : null;
      return {
        ...withSchedulePattern(c),
        enrolledCount: enrolled,
        enrolledStudentsCount: enrolled,
        teacherName: t?.name ?? "",
        roomName: r?.name ?? "",
      };
    });
  });

  return ok(result);
});

const schedulePatternSchema = z
  .object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((p) => isNotPastDate(toDateKey(p.startDate)), {
    message: "startDate cannot be in the past",
    path: ["startDate"],
  })
  .refine((p) => p.endDate >= p.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

const createSchema = z.object({
  teacherId: z.string().min(1),
  defaultRoomId: z.string().optional(),
  title: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  description: z.string().optional(),
  gradeTag: z.string().optional(),
  schedulePattern: schedulePatternSchema,
  price: moneySchema,
  maxStudents: z.number().int().positive().max(10000),
  // Room-based only; validated against the room's allowed methods at snapshot.
  pricingMethod: z.enum(["whole_room_percent", "per_attending_student"]).nullish(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, createSchema);
  // The create logic (affiliation check, room ownership, frozen pricing
  // snapshot, session generation) moved to the shared kernel so the back office
  // runs the SAME code. Guard, schema and response shape are unchanged.
  const { course, sessionsGenerated } = await createCourse(user, body);
  // Funnel step 3. Post-commit and never throwing — it counts rows to decide
  // whether this was the FIRST group, so it cannot double-fire.
  await trackFirstGroup(user, { centerId: course.centerId, teacherId: course.teacherId });
  return ok(
    {
      ...course,
      course,
      sessionsGenerated,
      sessionCount: sessionsGenerated,
    },
    { status: 201 },
  );
});
