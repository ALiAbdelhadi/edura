import { z } from "zod";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { trackFirstTeacher } from "@/lib/observability/funnel";
import { acceptCollaborationRequest } from "@/lib/services/collaboration/collaboration";

export const dynamic = "force-dynamic";

// Optional body: the TEACHER's pricing-method choice, required exactly when
// accepting a center-initiated request on a both-methods hall (the service
// answers `method_choice_required` otherwise).
const acceptSchema = z
  .object({
    pricingMethod: z.enum(["whole_room_percent", "per_attending_student"]).nullish(),
  })
  .nullish();

// Center side: MANAGER (and owner) may accept a teacher's collaboration
// request. Audited on-behalf-of the center for staff.
export const POST = delegatedWithCenter(
  async (req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    const body = acceptSchema.parse(await req.json().catch(() => null));
    const result = await acceptCollaborationRequest(id, user, {
      pricingMethod: body?.pricingMethod,
    });
    // Funnel step 3. Counted on ACCEPTANCE — a request nobody accepted is not
    // activation. Post-commit, never throws, fires only on the first one.
    await trackFirstTeacher(user, result.request?.centerId);
    return ok(result);
  },
  { staffAllow: MANAGER },
);
