import { z } from "zod";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { getSessionUser } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scope";
import { BusinessRuleError, ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema, isNotPastDate } from "@/lib/validation/common";
import { generateSessions } from "@/lib/services/sessions/session-generator";

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
  const user = await getSessionUser();

  const centerIdParam = url.searchParams.get("centerId");
  const teacherIdParam = url.searchParams.get("teacherId");
  const subject = url.searchParams.get("subject");
  const status = url.searchParams.get("status");

  const where: Prisma.CourseWhereInput = {};

  if (user?.role === "center_admin") {
    where.centerId = user.centerId;
  } else if (user?.role === "teacher") {
    where.teacherId = user.id;
  } else if (centerIdParam) {
    where.centerId = centerIdParam;
  }
  if (teacherIdParam && user?.role !== "teacher") where.teacherId = teacherIdParam;
  if (subject) where.subject = subject;
  if (status) where.status = status as Prisma.CourseWhereInput["status"];

  const result = await scopedDb(user, async (tx) => {
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
  .refine((p) => isNotPastDate(p.startDate.toISOString().slice(0, 10)), {
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
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, createSchema);

  if (!user.centerId) throw new ForbiddenError("Admin has no center scope");
  const centerId = user.centerId;

  const course = await scopedDb(user, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { teacherId: body.teacherId, status: "active", centerId },
    });
    if (!affiliation) {
      throw new BusinessRuleError("Teacher does not have an active affiliation with this center");
    }

    return tx.course.create({
      data: {
        centerId,
        teacherId: body.teacherId,
        defaultRoomId: body.defaultRoomId ?? null,
        title: body.title,
        subject: body.subject,
        description: body.description,
        gradeTag: body.gradeTag,
        daysOfWeek: body.schedulePattern.daysOfWeek,
        startTime: body.schedulePattern.startTime,
        endTime: body.schedulePattern.endTime,
        startDate: body.schedulePattern.startDate,
        endDate: body.schedulePattern.endDate,
        price: body.price,
        maxStudents: body.maxStudents,
        status: "active",
      },
    });
  });

  const sessionIds = await generateSessions(
    {
      id: course.id,
      teacherId: course.teacherId,
      defaultRoomId: course.defaultRoomId,
      schedulePattern: body.schedulePattern,
    },
    user,
  );

  const courseOut = withSchedulePattern(course);
  return ok(
    {
      ...courseOut,
      course: courseOut,
      sessionsGenerated: sessionIds.length,
      sessionCount: sessionIds.length,
    },
    { status: 201 },
  );
});
