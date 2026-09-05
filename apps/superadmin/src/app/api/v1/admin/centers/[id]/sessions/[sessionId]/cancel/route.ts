import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminCancelSession } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, sessionId } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await adminCancelSession(user, id, sessionId, reason));
});
