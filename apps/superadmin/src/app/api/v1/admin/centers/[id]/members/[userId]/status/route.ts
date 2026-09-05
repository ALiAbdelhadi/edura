import { withRole } from "@/lib/authz/require-role";
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

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, userId } = await ctx.params;
  const { kind, action, reason } = await parseJson(req, schema);
  return ok(await setCenterMemberStatus(id, userId, kind, action, reason, user));
});
