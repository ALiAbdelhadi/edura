import { requireRole } from "@/lib/authz/require-role";
import { toDateKey } from "@repo/server-core/lib/date-key";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminGetCourse, adminUpdateCourse } from "@/lib/services/admin/center-academic";
import { parseJson } from "@/lib/validation/zod";
import { isNotPastDate, moneySchema } from "@repo/server-core/validation/common";
import { z } from "zod";

export const dynamic = "force-dynamic";

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

// NOT editable, and absent from this schema on purpose: pricingMethod and the
// frozen split columns (splitPlatformBp / splitTeacherBp / splitCenterBp /
// m2CenterFee / m2CenterBp). They are snapshotted at creation and settlement
// reads them, so editing one would retroactively re-rate a live course (M4.5).
// `defaultRoomId` is absent for the same reason — the snapshot came from the
// hall, so a different hall means a new course.
const patchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    gradeTag: z.string().optional(),
    price: moneySchema.optional(),
    pricePerMonth: moneySchema.positive().nullish(),
    pricePerSession: moneySchema.positive().nullish(),
    maxStudents: z.number().int().positive().max(10000).optional(),
    schedulePattern: schedulePatternSchema.optional(),
  })
  .strict();

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, courseId } = await ctx.params;
  return ok(await adminGetCourse(user, id, courseId));
});

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, courseId } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await adminUpdateCourse(user, id, courseId, body));
});
