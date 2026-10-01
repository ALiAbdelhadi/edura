import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { refundsReport } from "@repo/server-core/backoffice/finance/finance-reports";

export const GET = withRole(["accountant", "super_admin"], async (_user, req) => {
  const p = new URL(req.url).searchParams;
  return ok(await refundsReport(p.get("from") ?? undefined, p.get("to") ?? undefined));
});
