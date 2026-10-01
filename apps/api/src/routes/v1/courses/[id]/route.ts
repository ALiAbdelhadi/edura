import { getSessionUser } from "@repo/server-core/erp-auth/session";
import { requireRole } from "@repo/server-core/authz/require-role";
import { toActingUser } from "@repo/server-core/authz/teacher-actor";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { moneySchema } from "@repo/server-core/validation/common";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  updateCourse,
  updateTeacherDirectPricing,
} from "@repo/server-core/services/center/courses";
import { getCourseDetail } from "@repo/server-core/services/courses/get-course";
import { z } from "zod";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrors(async (_req, ctx) => {
  const { id } = await ctx.params;
  const session = await getSessionUser();
  const viewer = session ? await toActingUser(session) : null;

  const result = await getCourseDetail(viewer, id);

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

const deliveryShape = {
  deliveryMode: z.enum(["onsite", "online", "hybrid"]).optional(),
  onlineUrl: z.string().trim().url().max(500).nullish(),
};

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
  ...deliveryShape,
});

const teacherPatchSchema = z
  .object({
    price: moneySchema.optional(),
    pricePerMonth: moneySchema.positive().nullish(),
    pricePerSession: moneySchema.positive().nullish(),
    settlementBasis: z.enum(["course_price", "session_price", "subscription"]).optional(),
    ...deliveryShape,
  })
  .strict();

const handlePatch = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin", "teacher");
  const { id } = await ctx.params;
  if (user.role === "teacher") {
    const body = await parseJson(req, teacherPatchSchema);
    return ok(await updateTeacherDirectPricing(user, id, body));
  }
  const body = await parseJson(req, patchSchema);
  return ok(await updateCourse(user, id, body));
});

export const PATCH = invalidatesPublicData(handlePatch);
