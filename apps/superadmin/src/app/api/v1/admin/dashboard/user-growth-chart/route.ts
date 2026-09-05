import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { userGrowthChart } from "@/lib/services/admin/platform-dashboard";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async () => {
  return ok(await userGrowthChart());
});
