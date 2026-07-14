import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { removeBlacklistEntry } from "@/lib/services/blacklist/blacklist";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const DELETE = withErrors(async (req, ctx) => {
  const user = await requireRole("teacher");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await removeBlacklistEntry(id, user, reason));
});
