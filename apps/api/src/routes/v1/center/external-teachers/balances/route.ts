import { ACCOUNTANT, centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { listOutstandingBalances } from "@repo/server-core/services/external-teachers/index";

export const GET = centerStaff(
  async (_req, _ctx, { acting }) => ok(await listOutstandingBalances(acting)),
  { allow: [...MANAGER, ...ACCOUNTANT] },
);
