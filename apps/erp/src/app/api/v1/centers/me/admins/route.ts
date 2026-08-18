import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listCenterAdmins } from "@repo/server-core/services/center/admins";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  return ok(await listCenterAdmins(user));
});
