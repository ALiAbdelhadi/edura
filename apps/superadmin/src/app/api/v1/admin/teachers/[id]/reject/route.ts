import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { rejectTeacher } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";
const schema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, schema);
  return ok(await rejectTeacher(id, reason, user.id));
});
