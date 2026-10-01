import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { setCenterRoomActive } from "@repo/server-core/backoffice/admin/center-control";

const schema = z.object({ isActive: z.boolean() }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, roomId } = await ctx.params;
  const { isActive } = await parseJson(req, schema);
  return ok(await setCenterRoomActive(id, roomId, isActive, user));
});
