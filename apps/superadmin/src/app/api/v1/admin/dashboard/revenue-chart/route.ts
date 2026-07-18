import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { revenueChart } from "@/lib/services/admin/platform-dashboard";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const period = new URL(req.url).searchParams.get("period") === "weekly" ? "weekly" : "monthly";
  return ok(await revenueChart(period));
});
