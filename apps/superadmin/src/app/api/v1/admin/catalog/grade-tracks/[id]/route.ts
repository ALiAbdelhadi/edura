import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { unlinkGradeTrack } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await unlinkGradeTrack(id));
});
