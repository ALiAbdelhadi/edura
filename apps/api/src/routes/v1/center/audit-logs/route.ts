import { requireRole } from "@repo/server-core/authz/require-role";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { listCenterAuditLogs } from "@repo/server-core/services/center/center-audit";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listCenterAuditLogs(user, q));
});
