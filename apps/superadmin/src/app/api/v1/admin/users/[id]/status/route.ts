import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { setUserSuspended } from "@/lib/services/admin/admin-users";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});

export const PATCH = withRole("super_admin", async (actor, req, ctx) => {
  const { id } = await ctx.params;
  const { suspended, reason } = await parseJson(req, bodySchema);
  return ok(await setUserSuspended(actor, id, suspended, reason));
});
