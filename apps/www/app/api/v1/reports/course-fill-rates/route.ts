import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getCourseFillRates } from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  const result = await getCourseFillRates(user);
  return ok(result);
});
