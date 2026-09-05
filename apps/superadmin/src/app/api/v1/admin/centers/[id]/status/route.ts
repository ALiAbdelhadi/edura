import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { setCenterStatus } from "@/lib/services/admin/center-control";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    action: z.enum(["activate", "deactivate"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { action, reason } = await parseJson(req, schema);
  return ok(await setCenterStatus(id, action, reason, user));
});
