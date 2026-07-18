import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { platformKpis } from "@/lib/services/admin/platform-dashboard";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireRole("super_admin");
  return ok(await platformKpis());
});
