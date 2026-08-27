import { ACCOUNTANT, centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { listOutstandingBalances } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (_req, _ctx, { acting }) => ok(await listOutstandingBalances(acting)),
  { allow: [...MANAGER, ...ACCOUNTANT] },
);
