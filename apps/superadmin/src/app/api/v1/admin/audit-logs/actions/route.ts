import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listAuditActions } from "@/lib/services/admin/audit-log";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireRole("super_admin");
  return ok(await listAuditActions());
});
