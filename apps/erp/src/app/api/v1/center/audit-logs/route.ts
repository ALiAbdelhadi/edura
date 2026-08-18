import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { listCenterAuditLogs } from "@repo/server-core/services/center/center-audit";

export const dynamic = "force-dynamic";

/**
 * The center owner's view of the immutable audit log.
 *
 * `center_admin` ONLY — deliberately not opened to `center_staff`. The log
 * records what the staff did; a receptionist who could read (and therefore
 * audit) their own manager is a different product decision, and the smaller
 * grant is the one that can be widened later without a migration. The
 * teacher/assistant delegation path is likewise absent: a teacher's actions
 * inside a center appear in the CENTER's log, and the teacher's own oversight
 * surface is a separate question this route does not answer.
 *
 * There is NO `centerId` parameter. The scope comes from the session inside
 * `listCenterAuditLogs`, so there is nothing in the request a caller could
 * edit to reach another center's rows.
 */
export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listCenterAuditLogs(user, q));
});
