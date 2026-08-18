import { z } from "zod";
import { runAfter } from "@/lib/http/after";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { trackFirstTeacher } from "@/lib/observability/funnel";
import { acceptCollaborationRequest } from "@/lib/services/collaboration/collaboration";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

// Optional body: the TEACHER's pricing-method choice, required exactly when
// accepting a center-initiated request on a both-methods hall (the service
// answers `method_choice_required` otherwise). A request with NO body at all
// stays accepted (the UI always posts `{}`, but tooling may not); a body that
// IS present must validate — via parseJson like every other route, so a
// wrong-shape body is a 400 validation_error, not a raw ZodError 500.
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
    const body = req.body ? await parseJson(req, acceptSchema) : null;
    const result = await acceptCollaborationRequest(id, user, {
      pricingMethod: body?.pricingMethod,
    });
    // Funnel step 3. Counted on ACCEPTANCE — a request nobody accepted is not
    // activation. Post-commit, never throws, fires only on the first one.
    // after(): the runtime still guarantees execution; the response no longer
    // waits on the analytics hop.
    runAfter(() => trackFirstTeacher(user, result.request?.centerId));
    return ok(result);
  },
  { staffAllow: MANAGER },
);
