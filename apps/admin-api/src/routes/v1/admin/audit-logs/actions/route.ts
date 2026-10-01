import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listAuditActions } from "@repo/server-core/backoffice/admin/audit-log";

export const GET = withRole("super_admin", async () => {
  return ok(await listAuditActions());
});
