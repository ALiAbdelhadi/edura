import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { blacklistCenter } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";
const schema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, schema);
  return ok(await blacklistCenter(id, reason, user.id));
});
