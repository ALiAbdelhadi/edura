import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { trialBalance } from "@/lib/services/finance/finance-reports";

export const dynamic = "force-dynamic";
export const GET = withRole(["accountant", "super_admin"], async (_user, req) => {
  const p = new URL(req.url).searchParams;
  return ok(await trialBalance(p.get("from") ?? undefined, p.get("to") ?? undefined));
});
