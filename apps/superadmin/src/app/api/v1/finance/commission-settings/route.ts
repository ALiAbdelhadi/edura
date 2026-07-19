import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getGlobalCommission } from "@/lib/services/settings/commission-admin";

export const dynamic = "force-dynamic";

/** READ-ONLY for the accountant — commission editing is super_admin only. */
export const GET = withErrors(async () => {
  await requireRole("accountant", "super_admin");
  return ok(await getGlobalCommission());
});
