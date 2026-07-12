import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getTransaction } from "@/lib/services/finance/financeReports";

export const dynamic = "force-dynamic";
// PRD §4.3 GET /finance/transactions/:id
export const GET = withErrors(async (_req, ctx) => {
  await requireRole("accountant", "super_admin");
  const { id } = await ctx.params;
  return ok(await getTransaction(id));
});
