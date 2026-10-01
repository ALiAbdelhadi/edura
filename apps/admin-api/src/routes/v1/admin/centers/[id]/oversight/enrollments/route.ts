import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { centerEnrollments } from "@repo/server-core/backoffice/admin/center-oversight";

export const GET = withRole("super_admin", async (_user, req, ctx) => {
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await centerEnrollments(id, q));
});
