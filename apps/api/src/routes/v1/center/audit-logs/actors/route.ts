import { requireRole } from "@repo/server-core/authz/require-role";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import {
  listCenterAuditActions,
  listCenterAuditActors,
} from "@repo/server-core/services/center/center-audit";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  const [actors, actions] = await Promise.all([
    listCenterAuditActors(user),
    listCenterAuditActions(user),
  ]);
  return ok({ actors, actions });
});
