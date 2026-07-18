import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { financeAlerts } from "@/lib/services/finance/finance-reports";

export const dynamic = "force-dynamic";
export const GET = withErrors(async () => {
  await requireRole("accountant", "super_admin");
  return ok(await financeAlerts());
});
