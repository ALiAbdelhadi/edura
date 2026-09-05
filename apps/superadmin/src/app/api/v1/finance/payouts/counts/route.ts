import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { payoutStatusCounts } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

export const GET = withRole(["accountant", "super_admin"], async () => {
  return ok(await payoutStatusCounts());
});
