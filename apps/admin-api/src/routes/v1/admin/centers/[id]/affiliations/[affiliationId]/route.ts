import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { updateAffiliationCenterShare } from "@repo/server-core/backoffice/admin/rooms-split";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z
  .object({ centerShare: z.number().int().min(0).max(99_999_900) })
  .strict();

export const PUT = withRole("super_admin", async (user, req, ctx) => {
  const { id, affiliationId } = await ctx.params;
  const { centerShare } = await parseJson(req, bodySchema);
  return ok(await updateAffiliationCenterShare(id, affiliationId, centerShare, user));
});
