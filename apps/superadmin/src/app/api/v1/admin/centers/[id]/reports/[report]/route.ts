import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminCenterReports } from "@/lib/services/admin/center-platform";

// One door for the eight center reports. Read-only: every branch is an
// aggregation, and an unknown report name is a 404 rather than a fall-through.
export const dynamic = "force-dynamic";

export const GET = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, report } = await ctx.params;
  const url = new URL(req.url);
  return ok(
    await adminCenterReports(user, id, report, {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    }),
  );
});
