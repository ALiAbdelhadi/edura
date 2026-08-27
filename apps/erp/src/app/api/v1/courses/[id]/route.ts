import { z } from "zod";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema } from "@/lib/validation/common";
import {
  updateCourse,
  updateTeacherDirectPricing,
} from "@repo/server-core/services/center/courses";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function schedulePatternOf(course: {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: Date;
  endDate: Date | null;
}) {
  return {
    daysOfWeek: course.daysOfWeek,
    startTime: course.startTime,
    endTime: course.endTime,
    startDate: course.startDate,
    endDate: course.endDate,
  };
}

export const GET = withErrors(async (_req, ctx) => {
  const { id } = await ctx.params;

  const result = await platformDb(async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");

    const [enrolledCount, teacher, center, reviews] = await Promise.all([
      tx.enrollment.count({ where: { courseId: id, status: "active" } }),
      tx.user.findUnique({ where: { id: course.teacherId }, select: { id: true, name: true } }),
      course.centerId
        ? tx.center.findUnique({ where: { id: course.centerId }, select: { id: true, name: true } })
        : null,
      tx.review.aggregate({
        where: { teacherId: course.teacherId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    const avg = reviews._avg.rating;
    return {
      ...course,
      schedulePattern: schedulePatternOf(course),
      remainingSeats: course.maxStudents - enrolledCount,
      enrolledCount,
      teacherName: teacher?.name ?? "",
      centerName: center?.name ?? "",
      centerId: course.centerId,
      teacherRating: avg ? Math.round(avg * 10) / 10 : 0,
      teacherReviewCount: reviews._count ?? 0,
    };
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
  .refine((p) => p.endDate >= p.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  gradeTag: z.string().optional(),
  price: moneySchema.optional(),
  pricePerMonth: moneySchema.positive().nullish(),
  pricePerSession: moneySchema.positive().nullish(),
  settlementBasis: z.enum(["course_price", "session_price", "subscription"]).optional(),
  maxStudents: z.number().int().positive().max(10000).optional(),
  defaultRoomId: z.string().optional(),
  schedulePattern: schedulePatternSchema.optional(),
});

const teacherPatchSchema = z
  .object({
    price: moneySchema.optional(),
    pricePerMonth: moneySchema.positive().nullish(),
    pricePerSession: moneySchema.positive().nullish(),
    settlementBasis: z.enum(["course_price", "session_price", "subscription"]).optional(),
  })
  .strict();

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin", "teacher");
  const { id } = await ctx.params;
  if (user.role === "teacher") {
    const body = await parseJson(req, teacherPatchSchema);
    return ok(await updateTeacherDirectPricing(user, id, body));
  }
  const body = await parseJson(req, patchSchema);
  return ok(await updateCourse(user, id, body));
});
