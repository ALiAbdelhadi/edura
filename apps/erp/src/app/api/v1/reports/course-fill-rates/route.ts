import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getCourseFillRates } from "@/lib/services/reports/reports";
import { parseProvenance } from "@/lib/http/provenance";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const result = await getCourseFillRates(user, parseProvenance(new URL(req.url)));
    return ok(result);
  },
  { allow: MANAGER },
);
