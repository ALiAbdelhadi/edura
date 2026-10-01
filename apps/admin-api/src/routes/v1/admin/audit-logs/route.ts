import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listAuditLogs } from "@repo/server-core/backoffice/admin/audit-log";

export const GET = withRole("super_admin", async (_user, req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listAuditLogs(q));
});
