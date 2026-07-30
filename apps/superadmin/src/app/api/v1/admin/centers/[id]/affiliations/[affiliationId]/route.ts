import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { updateAffiliationCenterShare } from "@/lib/services/admin/rooms-split";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ centerShare: z.number().int().min(0).max(99_999_900) })
  .strict();

export const PUT = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, affiliationId } = await ctx.params;
  const { centerShare } = await parseJson(req, bodySchema);
  return ok(await updateAffiliationCenterShare(id, affiliationId, centerShare, user));
});
