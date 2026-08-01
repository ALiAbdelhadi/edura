import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { revokeAllSessions } from "@/lib/services/admin/admin-users";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = withErrors(async (req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await revokeAllSessions(actor, id, reason));
});
