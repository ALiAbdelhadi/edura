import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminCenterReports } from "@/lib/services/admin/center-platform";

export const dynamic = "force-dynamic";

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
