import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { setCenterMemberStatus } from "@/lib/services/admin/center-control";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    kind: z.enum(["teacher", "student"]),
    action: z.enum(["activate", "deactivate"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, userId } = await ctx.params;
  const { kind, action, reason } = await parseJson(req, schema);
  return ok(await setCenterMemberStatus(id, userId, kind, action, reason, user));
});
