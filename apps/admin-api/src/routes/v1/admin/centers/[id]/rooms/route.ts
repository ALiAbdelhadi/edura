import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getCenterRoomsWithSplit } from "@repo/server-core/backoffice/admin/rooms-split";

export const GET = withRole("super_admin", async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await getCenterRoomsWithSplit(id));
});
