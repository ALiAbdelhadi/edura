import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { unlinkGradeTrack } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

export const DELETE = withRole("super_admin", async (actor, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await unlinkGradeTrack(id, actor));
});
