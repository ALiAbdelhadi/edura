import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { financeDashboard } from "@/lib/services/finance/accountant";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireRole("accountant", "super_admin");
  return ok(await financeDashboard());
});
