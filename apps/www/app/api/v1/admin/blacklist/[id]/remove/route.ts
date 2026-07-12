import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { removeBlacklistEntry } from "@/lib/services/blacklist/blacklist";

export const dynamic = "force-dynamic";


const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

// Lift any blacklist entry (super_admin). Reason mandatory (PRD §7).
export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await removeBlacklistEntry(id, user, reason));
});
