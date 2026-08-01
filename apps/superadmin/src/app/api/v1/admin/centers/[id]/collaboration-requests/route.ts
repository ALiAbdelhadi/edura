import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminCreateCollaborationRequest } from "@/lib/services/admin/center-people";

// Send a collaboration request to an ALREADY-REGISTERED teacher, as this
// center. The sibling `roster/teachers/invite` route is shell-account
// onboarding and refuses a registered teacher with a 409 — this is the door it
// points at.
//
// The center side is taken from the URL, never the body: `centerId` is
// deliberately absent from the schema (which is `.strict()`), so the back
// office cannot aim a request at a different center than the page it is on.
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
    // NO money field and NO `proposedPricingMethod`: every rate is
    // superadmin-only config that the kernel forces to 0, and a center-initiated
    // request may not pre-pick the method on a both-methods hall — the teacher
    // chooses when accepting. Both are server-enforced in the kernel too; the
    // schema just refuses them at the edge.
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

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminCreateCollaborationRequest(user, id, body), { status: 201 });
});
