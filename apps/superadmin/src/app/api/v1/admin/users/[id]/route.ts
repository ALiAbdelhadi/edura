import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { getUserDetail } from "@/lib/services/admin/admin-users";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await getUserDetail(id));
});
