import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { revenueChart } from "@repo/server-core/backoffice/admin/platform-dashboard";

export const GET = withRole("super_admin", async (_user, req) => {
  const period = new URL(req.url).searchParams.get("period") === "weekly" ? "weekly" : "monthly";
  return ok(await revenueChart(period));
});
