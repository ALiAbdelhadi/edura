import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { linkParent } from "@repo/server-core/backoffice/admin/platform";

const schema = z.object({ parentId: z.string().uuid() });

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { parentId } = await parseJson(req, schema);
  return ok(await linkParent(id, parentId, user.id), { status: 201 });
});
