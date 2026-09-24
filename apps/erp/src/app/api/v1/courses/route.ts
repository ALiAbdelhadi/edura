import { getSessionUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/authz/require-role";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { scopedDb } from "@/lib/db/scope";
import { withErrors } from "@/lib/errors/http";
import { runAfter } from "@/lib/http/after";
import { ok } from "@/lib/http/envelope";
import { trackFirstGroup } from "@/lib/observability/funnel";
import { isNotPastDate, moneySchema } from "@/lib/validation/common";
import { parseJson } from "@/lib/validation/zod";
import { Prisma } from "@repo/database";
import { toDateKey } from "@repo/server-core/lib/date-key";
import {
  createCourse,
  createTeacherDirectCourse,
} from "@repo/server-core/services/center/courses";
import { z } from "zod";
import { invalidatesPublicData } from "@/lib/cache/public-data";

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
  const deliveryMode = url.searchParams.get("deliveryMode");

  const result = await scopedDb(user, async (tx) => {
    const where: Prisma.CourseWhereInput = {};
    // Every other arm below scopes to courses the caller is already inside; the
    // centerId arm is the one a signed-out browser can reach, so it must not
    // carry the meeting link out with it.
    let publicBrowse = false;

    if (user?.role === "center_admin") {
      where.centerId = user.centerId;
      if (teacherIdParam) where.teacherId = teacherIdParam;
    } else if (user?.role === "teacher") {
      where.teacherId = user.id;
    } else if (user?.role === "student") {
      const enr = await tx.enrollment.findMany({
        where: { studentId: user.id },
        select: { courseId: true },
      });
      where.id = { in: enr.map((e) => e.courseId) };
    } else if (user?.role === "parent") {
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
      where.centerId = centerIdParam;
      publicBrowse = true;
    } else {
      return [];
    }

    if (subject) where.subject = subject;
    if (deliveryMode) {
      if (!["onsite", "online", "hybrid"].includes(deliveryMode)) return [];
      where.deliveryMode = deliveryMode as Prisma.CourseWhereInput["deliveryMode"];
    }
    if (status) {
      if (!["active", "ended", "cancelled"].includes(status)) return [];
      where.status = status as Prisma.CourseWhereInput["status"];
    }

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
        onlineUrl: publicBrowse ? null : c.onlineUrl,
        hasOnlineUrl: !!c.onlineUrl,
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

const deliveryShape = {
  deliveryMode: z.enum(["onsite", "online", "hybrid"]).optional(),
  onlineUrl: z.string().trim().url().max(500).nullish(),
};

const createSchema = z.object({
  teacherId: z.string().min(1),
  defaultRoomId: z.string().optional(),
  title: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  description: z.string().optional(),
  gradeTag: z.string().optional(),
  schedulePattern: schedulePatternSchema,
  price: moneySchema,
  pricePerMonth: moneySchema.nullish(),
  pricePerSession: moneySchema.nullish(),
  maxStudents: z.number().int().positive().max(10000),
  pricingMethod: z.enum(["whole_room_percent", "per_attending_student"]).nullish(),
  ...deliveryShape,
});

const teacherDirectSchema = z
  .object({
    title: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    description: z.string().optional(),
    gradeTag: z.string().optional(),
    location: z.string().trim().max(200).optional(),
    schedulePattern: schedulePatternSchema,
    maxStudents: z.number().int().positive().max(10000),
    pricePerMonth: moneySchema.nullish(),
    pricePerSession: moneySchema.nullish(),
    ...deliveryShape,
  })
  .strict();

const handlePost = withErrors(async (req) => {
  const session = await getSessionUser();
  if (session?.role === "teacher") {
    const body = await parseJson(req, teacherDirectSchema);
    const { course, sessionsGenerated } = await createTeacherDirectCourse(session, body);
    runAfter(() => trackFirstGroup(session, { centerId: null, teacherId: course.teacherId }));
    return ok(
      { ...course, course, sessionsGenerated, sessionCount: sessionsGenerated },
      { status: 201 },
    );
  }

  const user = await requireRole("center_admin");
  const body = await parseJson(req, createSchema);
  const { course, sessionsGenerated } = await createCourse(user, body);
  runAfter(() => trackFirstGroup(user, { centerId: course.centerId, teacherId: course.teacherId }));
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

export const POST = invalidatesPublicData(handlePost);
