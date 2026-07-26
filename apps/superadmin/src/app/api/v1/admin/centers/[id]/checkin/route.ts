import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminCounterCheckin } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ studentId: z.uuid(), sessionId: z.uuid() }).strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminCounterCheckin(user, id, body));
});
