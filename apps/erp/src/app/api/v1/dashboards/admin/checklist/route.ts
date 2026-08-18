import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getCenterChecklist } from "@/lib/services/activation/center-checklist";

export const dynamic = "force-dynamic";

/**
 * The center's setup checklist. Booleans only — no counts, no money, no names —
 * so it is safe for a MANAGER as well as the owner, unlike the sibling
 * dashboard route which has to strip its financial fields for that role.
 *
 * `center_accountant` is excluded by `MANAGER`, and correctly: setting a center
 * up is not a finance task.
 */
export const GET = centerStaff(
  async (_req, _ctx, { acting }) => ok(await getCenterChecklist(acting)),
  { allow: MANAGER },
);
