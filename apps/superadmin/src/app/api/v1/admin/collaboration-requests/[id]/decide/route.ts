import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { decideCollaborationRequest } from "@/lib/services/admin/center-control";

// Control op #5 — approve / reject a pending collaboration request on behalf of
// the platform. Runs the SAME acceptance transaction the parties run (shared
// kernel, `platform_override` mode), so the resulting course, affiliation,
// sessions and frozen pricing snapshot are identical. No money value is
// accepted from the client: `pricingMethod` selects WHICH superadmin-configured
// rate applies, never the rate itself.
export const dynamic = "force-dynamic";

const schema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(500).optional(),
    pricingMethod: z.enum(["whole_room_percent", "per_attending_student"]).nullable().optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { decision, reason, pricingMethod } = await parseJson(req, schema);
  return ok(
    await decideCollaborationRequest(id, decision, { reason, pricingMethod }, user),
  );
});
