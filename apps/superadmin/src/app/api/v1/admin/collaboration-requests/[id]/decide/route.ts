import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { decideCollaborationRequest } from "@/lib/services/admin/center-control";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(500).optional(),
    pricingMethod: z.enum(["whole_room_percent", "per_attending_student"]).nullable().optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { decision, reason, pricingMethod } = await parseJson(req, schema);
  return ok(
    await decideCollaborationRequest(id, decision, { reason, pricingMethod }, user),
  );
});
