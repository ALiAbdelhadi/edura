import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminCenterReports } from "@repo/server-core/backoffice/admin/center-platform";

export const GET = withRole("super_admin", async (user, req, ctx) => {
  const { id, report } = await ctx.params;
  const url = new URL(req.url);
  return ok(
    await adminCenterReports(user, id, report, {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    }),
  );
});
