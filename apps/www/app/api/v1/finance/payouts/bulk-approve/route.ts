import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { bulkApprovePayouts } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

export const POST = withErrors(async (req) => {
  const user = await requireRole("accountant", "super_admin");
  const { ids } = await parseJson(req, bodySchema);
  return ok(await bulkApprovePayouts(ids, user));
});
