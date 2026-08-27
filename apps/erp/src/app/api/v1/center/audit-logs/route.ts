import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { listCenterAuditLogs } from "@repo/server-core/services/center/center-audit";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listCenterAuditLogs(user, q));
});
