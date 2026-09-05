import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listAuditLogs } from "@/lib/services/admin/audit-log";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listAuditLogs(q));
});
