import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { revokeAllSessions } from "@/lib/services/admin/admin-users";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = withRole("super_admin", async (actor, req, ctx) => {
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await revokeAllSessions(actor, id, reason));
});
