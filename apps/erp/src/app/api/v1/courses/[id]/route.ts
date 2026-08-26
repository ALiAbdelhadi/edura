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
  // No "startDate cannot be in the past" refine here, deliberately: this is
  // the EDIT schema, and a course that already started legitimately carries a
  // past startDate — the blanket refine made every historical course
  // uneditable. updateCourse enforces the real rule instead: keeping the
  // existing startDate is fine, MOVING it into the past is refused.
  .refine((p) => p.endDate >= p.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  gradeTag: z.string().optional(),
  price: moneySchema.optional(),
  // Step 4/5 plan pricing: null clears (disables) a plan. Courses created from
  // accepted collaboration requests start UNPRICED — the owner sets these so
  // students can subscribe.
  pricePerMonth: moneySchema.positive().nullish(),
  pricePerSession: moneySchema.positive().nullish(),
  // What one lesson is worth for this group. Owner-only, like the prices it
  // chooses between — it decides what the settlement distributes.
  settlementBasis: z.enum(["course_price", "session_price", "subscription"]).optional(),
  maxStudents: z.number().int().positive().max(10000).optional(),
  defaultRoomId: z.string().optional(),
  schedulePattern: schedulePatternSchema.optional(),
});

/**
 * T-1: the teacher branch takes PRICING ONLY, on the caller's own
 * teacher-direct (`centerId IS NULL`) groups. `.strict()` so a non-pricing
 * field is refused loudly rather than silently dropped — a teacher must not
 * learn "title edits work" from a request that quietly ignored the title.
 * Deliberately NOT `delegated()`: plan prices are financial settings, which
 * Step 8 excludes from assistant delegation.
 */
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
  // Moved to the shared kernel — including the two money guards it carries:
  // the hall cannot be swapped (the pricing snapshot was frozen from it), and a
  // price edit must still cover a Method-2 per-student fee.
  return ok(await updateCourse(user, id, body));
});
