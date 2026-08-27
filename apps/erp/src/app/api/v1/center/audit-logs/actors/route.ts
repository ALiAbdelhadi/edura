import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import {
  listCenterAuditActions,
  listCenterAuditActors,
} from "@repo/server-core/services/center/center-audit";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  const [actors, actions] = await Promise.all([
    listCenterAuditActors(user),
    listCenterAuditActions(user),
  ]);
  return ok({ actors, actions });
});
