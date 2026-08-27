import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getCenterChecklist } from "@/lib/services/activation/center-checklist";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (_req, _ctx, { acting }) => ok(await getCenterChecklist(acting)),
  { allow: MANAGER },
);
