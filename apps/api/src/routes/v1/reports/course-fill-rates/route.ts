import { centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getCourseFillRates } from "@repo/server-core/services/reports/reports";
import { parseProvenance } from "@repo/server-core/http/provenance";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const result = await getCourseFillRates(user, parseProvenance(new URL(req.url)));
    return ok(result);
  },
  { allow: MANAGER },
);
