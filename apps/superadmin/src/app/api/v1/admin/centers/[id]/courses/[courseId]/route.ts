import { withRole } from "@/lib/authz/require-role";
import { toDateKey } from "@repo/server-core/lib/date-key";
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

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id, courseId } = await ctx.params;
  return ok(await adminGetCourse(user, id, courseId));
});

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id, courseId } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await adminUpdateCourse(user, id, courseId, body));
});
