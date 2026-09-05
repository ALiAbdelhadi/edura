import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminCreateCollaborationRequest } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    teacherId: z.string().uuid(),
    subjectId: z.string().uuid(),
    gradeLevelId: z.string().uuid(),
    trackId: z.string().uuid().nullish(),
    roomId: z.string().uuid().nullish(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullish(),
    expectedStudents: z.number().int().positive().max(10000).nullish(),
    message: z.string().trim().max(1000).nullish(),
  })
  .strict()
  .refine((b) => !b.endDate || b.endDate >= b.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  })
  .refine((b) => b.endTime > b.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminCreateCollaborationRequest(user, id, body), { status: 201 });
});
