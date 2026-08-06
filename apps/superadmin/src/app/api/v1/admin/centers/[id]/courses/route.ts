import { requireRole } from "@/lib/authz/require-role";
import { toDateKey } from "@repo/server-core/lib/date-key";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminCreateCourse } from "@/lib/services/admin/center-academic";
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

// Identical to the center's own create schema. `pricingMethod` selects WHICH
// superadmin-configured rate is frozen onto the course — it is not a rate.
const createSchema = z
  .object({
    teacherId: z.uuid(),
    defaultRoomId: z.uuid().optional(),
    title: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    description: z.string().optional(),
    gradeTag: z.string().optional(),
    schedulePattern: schedulePatternSchema,
    price: moneySchema,
    maxStudents: z.number().int().positive().max(10000),
    pricingMethod: z.enum(["whole_room_percent", "per_attending_student"]).nullish(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, createSchema);
  const result = await adminCreateCourse(user, id, body);
  return ok(result, { status: 201 });
});
