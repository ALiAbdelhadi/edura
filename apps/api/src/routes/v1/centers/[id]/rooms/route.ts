import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { browseCenterRooms } from "@repo/server-core/services/rooms/browse-center-rooms";

export const GET = withErrors(async (_req, ctx) => {
  await requireRole("teacher", "assistant");
  const { id } = await ctx.params;

  const result = await browseCenterRooms(id);

  return ok(result);
});
