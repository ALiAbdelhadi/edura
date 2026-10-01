import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { linkTeacherCenter } from "@repo/server-core/backoffice/admin/platform";

const schema = z.object({ centerId: z.string().uuid() });

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { centerId } = await parseJson(req, schema);
  return ok(await linkTeacherCenter(id, centerId, user.id), { status: 201 });
});
