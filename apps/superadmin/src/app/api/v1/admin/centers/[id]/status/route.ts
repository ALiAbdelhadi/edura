import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
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

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { action, reason } = await parseJson(req, schema);
  return ok(await setCenterStatus(id, action, reason, user));
});
