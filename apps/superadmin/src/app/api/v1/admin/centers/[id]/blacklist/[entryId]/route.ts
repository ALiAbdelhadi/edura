import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminLiftCenterBlacklist } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export const DELETE = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, entryId } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await adminLiftCenterBlacklist(user, id, entryId, reason));
});
