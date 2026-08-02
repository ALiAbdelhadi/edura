import { ACCOUNTANT, centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { listOutstandingBalances } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

/**
 * Everyone this center owes right now, largest first.
 *
 * The figure is the teacher's accrued wallet balance — what the ONE money
 * engine credited them across every settled lesson. Nothing here recomputes it.
 */
export const GET = centerStaff(
  async (_req, _ctx, { acting }) => ok(await listOutstandingBalances(acting)),
  { allow: [...MANAGER, ...ACCOUNTANT] },
);
