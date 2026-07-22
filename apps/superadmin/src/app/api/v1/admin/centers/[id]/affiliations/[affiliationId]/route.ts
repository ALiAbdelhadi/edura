import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { updateAffiliationCenterShare } from "@/lib/services/admin/rooms-split";

export const dynamic = "force-dynamic";

// centerShare is piasters per present student for the teacher's NO-ROOM
// courses at this center. super_admin ONLY — neither the teacher nor the
// center can set it (collaboration requests always store 0).
const bodySchema = z
  .object({ centerShare: z.number().int().min(0).max(99_999_900) })
  .strict();

export const PUT = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, affiliationId } = await ctx.params;
  const { centerShare } = await parseJson(req, bodySchema);
  return ok(await updateAffiliationCenterShare(id, affiliationId, centerShare, user));
});
