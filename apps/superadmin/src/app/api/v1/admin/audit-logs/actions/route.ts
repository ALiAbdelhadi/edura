import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listAuditActions } from "@/lib/services/admin/audit-log";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async () => {
  return ok(await listAuditActions());
});
