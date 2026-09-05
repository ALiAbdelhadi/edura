import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminLiftCenterBlacklist } from "@/lib/services/admin/center-operations";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export const DELETE = withRole("super_admin", async (user, req, ctx) => {
  const { id, entryId } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await adminLiftCenterBlacklist(user, id, entryId, reason));
});
