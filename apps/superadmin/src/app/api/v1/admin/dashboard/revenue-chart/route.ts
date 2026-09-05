import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { revenueChart } from "@/lib/services/admin/platform-dashboard";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const period = new URL(req.url).searchParams.get("period") === "weekly" ? "weekly" : "monthly";
  return ok(await revenueChart(period));
});
