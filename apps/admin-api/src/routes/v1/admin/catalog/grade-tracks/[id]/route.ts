import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { unlinkGradeTrack } from "@repo/server-core/services/catalog/catalog-admin";

export const DELETE = withRole("super_admin", async (actor, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await unlinkGradeTrack(id, actor));
});
