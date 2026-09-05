import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { linkParent } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";
const schema = z.object({ parentId: z.string().uuid() });

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { parentId } = await parseJson(req, schema);
  return ok(await linkParent(id, parentId, user.id), { status: 201 });
});
