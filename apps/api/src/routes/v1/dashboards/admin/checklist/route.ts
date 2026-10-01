import { centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getCenterChecklist } from "@repo/server-core/services/activation/center-checklist";

export const GET = centerStaff(
  async (_req, _ctx, { acting }) => ok(await getCenterChecklist(acting)),
  { allow: MANAGER },
);
