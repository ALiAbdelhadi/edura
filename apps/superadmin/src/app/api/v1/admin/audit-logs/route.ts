import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listAuditLogs } from "@/lib/services/admin/audit-log";

// Audit-log viewer (roadmap decision #10). GET only — audit_logs is REVOKEd
// UPDATE/DELETE at the DB, and there is no write path here either.
export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listAuditLogs(q));
});
